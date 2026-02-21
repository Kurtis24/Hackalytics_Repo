"""
Arbitrage Middleware Service — PRD v3.0 (Volume Optimization)

Transformation layer: receives a raw ML prediction payload, applies the four-step
volume optimization algorithm, and returns structured ArbitrageOpportunity objects.

Volume algorithm (PRD v3 §3):
  Step 1 — Measure line movement (IP distance from open to current)
  Step 2 — Compute market ceiling (remaining depth before sportsbook detects position)
  Step 3 — Compute Kelly stake (Quarter Kelly on true arb margin)
  Step 4 — final_volume = MIN(kelly, ceiling, bankroll_cap); drop if profit < floor
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
# Odds conversion helpers
# ---------------------------------------------------------------------------

def implied_prob(american_odds: int) -> float:
    """Convert American odds to implied probability."""
    if american_odds > 0:
        return 100 / (american_odds + 100)
    return abs(american_odds) / (abs(american_odds) + 100)


def to_decimal(american_odds: int) -> float:
    """Convert American odds to decimal odds."""
    if american_odds > 0:
        return (american_odds / 100) + 1
    return (100 / abs(american_odds)) + 1


# ---------------------------------------------------------------------------
# Volume algorithm helpers
# ---------------------------------------------------------------------------

_SENSITIVITY_MAP = {
    "moneyline":    "sensitivity_moneyline",
    "spread":       "sensitivity_spread",
    "points_total": "sensitivity_points_total",
}


def _get_sensitivity(market_type: str) -> int:
    attr = _SENSITIVITY_MAP.get(market_type.lower(), "sensitivity_moneyline")
    return int(getattr(settings, attr))


def _line_movement(market: MarketInput) -> float:
    """
    Step 1 — Measure IP movement from open to current on each side.
    Returns the larger of the two moves (conservative estimate).
    If opening odds are not provided, assumes no movement (open == current).
    """
    open1 = market.open_price_1 if market.open_price_1 is not None else market.price_1
    open2 = market.open_price_2 if market.open_price_2 is not None else market.price_2

    move1 = abs(implied_prob(market.price_1) - implied_prob(open1))
    move2 = abs(implied_prob(market.price_2) - implied_prob(open2))
    return max(move1, move2)


def _market_ceiling(line_mov: float, market_type: str) -> int:
    """
    Step 2 — Maximum stake (USD) before our position moves the line further.

    remaining_headroom = max(TRIGGER_THRESHOLD − (lineMovement × 0.5), 0.001)
    ceiling = round(headroom × SENSITIVITY)
    """
    sensitivity = _get_sensitivity(market_type)
    headroom = max(settings.trigger_threshold - (line_mov * 0.5), 0.001)
    return round(headroom * sensitivity)


def _kelly_stake(arb_margin: float, dec1: float, dec2: float) -> int:
    """
    Step 3 — Quarter-Kelly stake for a two-sided arb.
    Returns 0 if arb_margin <= 0 (no guaranteed edge).

    binding_side = the book with lower decimal (more conservative denominator).
    full_kelly = arb_margin / (binding_side − 1)
    """
    if arb_margin <= 0:
        return 0
    binding_side = min(dec1, dec2)
    if (binding_side - 1) == 0:
        return 0
    full_kelly = arb_margin / (binding_side - 1)
    return round(full_kelly * settings.kelly_fraction * settings.bankroll)


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
    Apply all PRD v3 arithmetic to a single market and return an
    ArbitrageOpportunity, or None if the market should be dropped.
    """

    # --- Basic validation ---
    if market.price_1 == market.price_2:
        logger.warning("Dropping '%s' — identical odds on both sides.", market.market_type)
        return None

    if market.bookmaker_1 == market.bookmaker_2:
        logger.warning("Dropping '%s' — same bookmaker on both sides.", market.market_type)
        return None

    # --- Decimal odds + arb margin ---
    dec1 = to_decimal(market.price_1)
    dec2 = to_decimal(market.price_2)
    arb_sum    = (1 / dec1) + (1 / dec2)
    arb_margin = 1 - arb_sum   # > 0 → true arb; ≤ 0 → no guaranteed lock

    # --- Step 1: Line movement ---
    line_mov = _line_movement(market)

    # --- Step 2: Market ceiling ---
    ceiling = _market_ceiling(line_mov, market.market_type)

    # --- Step 3: Kelly stake (only for true arbs) ---
    kelly = _kelly_stake(arb_margin, dec1, dec2)

    # --- Step 4: Take minimum, apply bankroll hard cap ---
    bankroll_cap = round(settings.bankroll * settings.bankroll_cap_pct)

    if kelly > 0:
        optimal_volume = min(kelly, ceiling, bankroll_cap)
    else:
        # No guaranteed edge — no volume to deploy
        optimal_volume = 0

    # --- Proportional stake split ---
    if optimal_volume > 0 and arb_sum > 0:
        stake1 = round(optimal_volume * (1 / dec1) / arb_sum)
        stake2 = round(optimal_volume * (1 / dec2) / arb_sum)
    else:
        stake1 = 0
        stake2 = 0

    payout1 = stake1 * dec1
    payout2 = stake2 * dec2
    guaranteed_profit = round(min(payout1, payout2) - optimal_volume) if optimal_volume > 0 else 0

    # --- Floor check: drop if profit below minimum ---
    if guaranteed_profit < settings.min_profit_floor:
        logger.debug(
            "Dropping '%s' — guaranteed profit $%d below floor $%d "
            "(volume=%d, ceiling=%d, kelly=%d).",
            market.market_type, guaranteed_profit, settings.min_profit_floor,
            optimal_volume, ceiling, kelly,
        )
        return None

    # --- profit_score ---
    profit_score = round(min(arb_margin / settings.profit_cap, 1.0), 4) if arb_margin > 0 else 0.0

    # --- Risk Factor 1: Model confidence risk (weight 40%) ---
    confidence_risk = 1 - market.confidence

    # --- Risk Factor 2: Arb validity risk (weight 35%) ---
    total_implied = implied_prob(market.price_1) + implied_prob(market.price_2)
    if total_implied < 1.0:
        arb_validity_risk = 0.0
    else:
        arb_validity_risk = min((total_implied - 1.0) / settings.arb_risk_cap, 1.0)

    # --- Risk Factor 3: Market impact risk (weight 25%) ---
    exposure_ratio = (optimal_volume / guaranteed_profit) if guaranteed_profit > 0 else settings.exposure_cap
    market_impact_risk = min(exposure_ratio / settings.exposure_cap, 1.0)

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
        optimal_volume=optimal_volume,
        stake_book1=stake1,
        stake_book2=stake2,
        guaranteed_profit=guaranteed_profit,
        line_movement=round(line_mov, 6),
        market_ceiling=ceiling,
        kelly_stake=kelly,
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
    confidence threshold, applies four-step volume algorithm, returns markets
    that pass the minimum profit floor.
    """
    results: list[ArbitrageOpportunity] = []

    for market in prediction.markets:
        if market.confidence < settings.min_confidence:
            logger.debug(
                "Dropping '%s' — confidence %.2f below threshold %.2f.",
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
        "process_prediction: %d/%d markets passed for %s vs %s.",
        len(results), len(prediction.markets),
        prediction.home_team, prediction.away_team,
    )
    return results
