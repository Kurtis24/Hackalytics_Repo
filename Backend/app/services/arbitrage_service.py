"""
Arbitrage Middleware Service — PRD v2.0

Transformation layer: receives a raw ML prediction payload, applies financial
scoring logic (Kelly staking, profit_score, risk_score), and returns structured
ArbitrageOpportunity objects for the frontend.

This service owns ALL business logic. It does not fetch odds, access databases,
or contact sportsbooks.

Section references map directly to Arbitrage_Middleware_PRD_v2.
"""

import logging

from app.config import settings
from app.models.arbitrage import (
    ArbitrageOpportunity,
    MarketInput,
    PredictionInput,
    SportsbookEntry,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Odds conversion helpers  (PRD §4.1, §4.2)
# ---------------------------------------------------------------------------

def implied_prob(american_odds: int) -> float:
    """Convert American odds to implied probability (PRD §4.1)."""
    if american_odds > 0:
        return 100 / (american_odds + 100)
    return abs(american_odds) / (abs(american_odds) + 100)


def to_decimal(american_odds: int) -> float:
    """Convert American odds to decimal odds (PRD §4.2)."""
    if american_odds > 0:
        return (american_odds / 100) + 1
    return (100 / abs(american_odds)) + 1


# ---------------------------------------------------------------------------
# Core per-market computation
# ---------------------------------------------------------------------------

def _process_market(
    market: MarketInput,
    category: str,
    date: str,
    home_team: str,
    away_team: str,
) -> ArbitrageOpportunity | None:
    """
    Apply all PRD arithmetic to a single market and return an
    ArbitrageOpportunity, or None if the market should be dropped.
    """

    # --- Edge-case validation (PRD §8) ---
    if market.price_1 == market.price_2:
        logger.warning(
            "Dropping market '%s' — identical odds (%d) on both sides (likely data error).",
            market.market_type, market.price_1,
        )
        return None

    if market.bookmaker_1 == market.bookmaker_2:
        logger.warning(
            "Dropping market '%s' — same bookmaker (%s) on both sides.",
            market.market_type, market.bookmaker_1,
        )
        return None

    # --- Step 1: Implied probabilities (PRD §4.1) ---
    ip1 = implied_prob(market.price_1)
    ip2 = implied_prob(market.price_2)
    total_implied = ip1 + ip2

    # --- Step 2: Decimal odds + arb margin (PRD §4.2) ---
    dec1 = to_decimal(market.price_1)
    dec2 = to_decimal(market.price_2)
    arb_sum = (1 / dec1) + (1 / dec2)
    arb_margin = 1 - arb_sum   # > 0 → true arb; <= 0 → value-bet territory

    # --- Step 3: Kelly stake + hard cap (PRD §4.3) ---
    if arb_margin > 0:
        # True arb: Kelly fraction derived from guaranteed edge
        kelly_f1 = arb_margin / (dec1 - 1)
        kelly_f2 = arb_margin / (dec2 - 1)
        full_kelly = min(kelly_f1, kelly_f2)
    else:
        # No guaranteed lock: use confidence as edge proxy (PRD §6 worked example)
        edge = max(arb_margin, (market.confidence - 0.5) * 0.1)
        full_kelly = edge / (dec1 - 1) if (dec1 - 1) != 0 else 0.0

    kelly_stake = full_kelly * settings.kelly_fraction
    total_stake = round(min(kelly_stake * settings.bankroll, settings.max_total_stake))

    # Minimum $1 stake (PRD §8 edge case)
    if total_stake < 1:
        total_stake = 1

    # --- Step 4: Proportional stake split (PRD §4.4) ---
    stake1 = round(total_stake * (1 / dec1) / arb_sum)
    stake2 = round(total_stake * (1 / dec2) / arb_sum)

    payout1 = stake1 * dec1
    payout2 = stake2 * dec2
    guaranteed_profit = max(0, round(min(payout1, payout2) - total_stake))  # never negative (PRD §8)

    # --- Step 5: profit_score (PRD §4.5) ---
    profit_score = round(min(arb_margin / settings.profit_cap, 1.0), 4) if arb_margin > 0 else 0.0

    # --- Risk Factor 1: Model confidence risk (PRD §5.1, weight 40 %) ---
    confidence_risk = 1 - market.confidence

    # --- Risk Factor 2: Arb validity risk (PRD §5.2, weight 35 %) ---
    if total_implied < 1.0:
        arb_validity_risk = 0.0
    else:
        arb_validity_risk = min((total_implied - 1.0) / settings.arb_risk_cap, 1.0)

    # --- Risk Factor 3: Market impact risk (PRD §5.3, weight 25 %) ---
    exposure_ratio = (total_stake / guaranteed_profit) if guaranteed_profit > 0 else settings.exposure_cap
    market_impact_risk = min(exposure_ratio / settings.exposure_cap, 1.0)

    # --- Final risk_score composite (PRD §5.4) ---
    risk_score = round(
        settings.weight_confidence   * confidence_risk
        + settings.weight_arb_validity * arb_validity_risk
        + settings.weight_mkt_impact   * market_impact_risk,
        4,
    )

    return ArbitrageOpportunity(
        category=category,
        date=date,
        home_team=home_team,
        away_team=away_team,
        market_type=market.market_type,
        confidence=market.confidence,
        profit_score=profit_score,
        risk_score=risk_score,
        stake_book1=stake1,
        stake_book2=stake2,
        total_stake=total_stake,
        guaranteed_profit=guaranteed_profit,
        sportsbooks=[
            SportsbookEntry(name=market.bookmaker_1, odds=market.price_1, stake=stake1),
            SportsbookEntry(name=market.bookmaker_2, odds=market.price_2, stake=stake2),
        ],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def process_prediction(prediction: PredictionInput) -> list[ArbitrageOpportunity]:
    """
    Entry point: receives one game prediction payload, filters markets by
    confidence threshold, computes stakes + scores, returns qualifying opportunities.

    Returns an empty list if no markets pass the confidence filter (PRD §8).
    """
    results: list[ArbitrageOpportunity] = []

    for market in prediction.markets:
        # --- Confidence filter (PRD §3) ---
        if market.confidence < settings.min_confidence:
            logger.debug(
                "Dropping market '%s' — confidence %.2f below threshold %.2f.",
                market.market_type, market.confidence, settings.min_confidence,
            )
            continue

        opportunity = _process_market(
            market=market,
            category=prediction.category,
            date=prediction.date,
            home_team=prediction.home_team,
            away_team=prediction.away_team,
        )
        if opportunity is not None:
            results.append(opportunity)

    logger.info(
        "process_prediction: %d/%d markets produced opportunities for %s vs %s.",
        len(results), len(prediction.markets),
        prediction.home_team, prediction.away_team,
    )
    return results
