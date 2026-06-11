"""
Prediction-market arbitrage detection.

Pulls live binary markets from Polymarket and Kalshi and finds
guaranteed-profit two-leg positions:

  • intra-venue — buy YES and NO on the SAME market when
        yes_ask + no_ask < 1.0   (the book is crossed in your favour)

  • cross-venue — match a Polymarket market to a Kalshi market by
        question similarity, then buy YES on the cheaper venue and NO on
        the other (or vice-versa) when the two legs cost < 1.0 combined.

Every opportunity pays out exactly $1 per share regardless of outcome,
so profit_margin = 1 − total_cost is locked in at trade time.
"""

from __future__ import annotations

import asyncio
import logging
import re
from difflib import SequenceMatcher

import httpx

from app.config import settings
from app.models.prediction_market import (
    ArbitrageLeg,
    PredictionArbitrageOpportunity,
    PredictionArbitrageResponse,
    PredictionMarketQuote,
)
from app.services import kalshi_service, polymarket_service

logger = logging.getLogger(__name__)

_STOPWORDS = {
    "will", "the", "a", "an", "be", "to", "of", "in", "on", "at", "by",
    "for", "is", "are", "and", "or", "this", "that", "before", "after",
    "than", "with", "win", "beat", "vs", "market", "yes", "no", "2025",
    "2026", "2027",
}


# ---------------------------------------------------------------------------
# Text helpers for cross-venue matching
# ---------------------------------------------------------------------------

def _tokens(title: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", title.lower())
    return {w for w in words if w not in _STOPWORDS and len(w) > 2}


def _jaccard(a: set[str], b: set[str]) -> float:
    """Token-overlap ratio (0-1)."""
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _match_score(title_a: str, title_b: str) -> float:
    """Combined similarity (0-1) of two questions.

    Blends a character-level sequence ratio with token-overlap (Jaccard).
    Both must be reasonably high for a match, which prevents superficially
    similar but semantically different questions (e.g. "win the Finals" vs
    "win the 2nd half by 5.5") from being treated as the same event.
    """
    tokens_a, tokens_b = _tokens(title_a), _tokens(title_b)
    jaccard = _jaccard(tokens_a, tokens_b)
    # Hard floor: require meaningful token overlap before trusting the match.
    if jaccard < 0.5:
        return 0.0

    a = " ".join(sorted(tokens_a))
    b = " ".join(sorted(tokens_b))
    seq = SequenceMatcher(None, a, b).ratio()
    return round(0.5 * seq + 0.5 * jaccard, 4)


# ---------------------------------------------------------------------------
# Opportunity builders
# ---------------------------------------------------------------------------

def _leg(quote: PredictionMarketQuote, side: str) -> ArbitrageLeg:
    price = quote.yes_ask if side == "YES" else quote.no_ask
    return ArbitrageLeg(
        venue=quote.venue,
        market_id=quote.market_id,
        title=quote.title,
        side=side,
        price=price,
        url=quote.url,
    )


def _opportunity(
    kind: str,
    leg_1: ArbitrageLeg,
    leg_2: ArbitrageLeg,
    question: str,
    end_date: str,
    match_score: float,
) -> PredictionArbitrageOpportunity:
    total_cost = round(leg_1.price + leg_2.price, 4)
    profit_margin = round(1.0 - total_cost, 4)
    roi_pct = round((profit_margin / total_cost) * 100, 2) if total_cost > 0 else 0.0
    return PredictionArbitrageOpportunity(
        kind=kind,
        question=question,
        leg_1=leg_1,
        leg_2=leg_2,
        total_cost=total_cost,
        profit_margin=profit_margin,
        roi_pct=roi_pct,
        match_score=round(match_score, 3),
        requires_verification=(kind == "cross"),
        end_date=end_date,
    )


def detect_intra_market_arbitrage(
    quotes: list[PredictionMarketQuote],
    min_margin: float,
) -> list[PredictionArbitrageOpportunity]:
    """Find single-market books where YES + NO can be bought for < $1."""
    opps: list[PredictionArbitrageOpportunity] = []
    for q in quotes:
        cost = q.yes_ask + q.no_ask
        if 0 < cost < 1.0 and (1.0 - cost) >= min_margin:
            opps.append(
                _opportunity(
                    kind="intra",
                    leg_1=_leg(q, "YES"),
                    leg_2=_leg(q, "NO"),
                    question=q.title,
                    end_date=q.end_date,
                    match_score=1.0,
                )
            )
    return opps


def detect_cross_market_arbitrage(
    poly: list[PredictionMarketQuote],
    kalshi: list[PredictionMarketQuote],
    min_margin: float,
    match_threshold: float,
) -> list[PredictionArbitrageOpportunity]:
    """Match Polymarket ↔ Kalshi markets by question and find cross-venue arbs.

    A token pre-filter (≥2 shared significant words) keeps the pairwise
    comparison cheap before the more expensive similarity ratio runs.
    """
    # Pre-tokenise Kalshi side once.
    kalshi_tokens = [(k, _tokens(k.title)) for k in kalshi]

    opps: list[PredictionArbitrageOpportunity] = []
    for p in poly:
        p_tokens = _tokens(p.title)
        if not p_tokens:
            continue

        for k, k_tokens in kalshi_tokens:
            if len(p_tokens & k_tokens) < 2:
                continue

            score = _match_score(p.title, k.title)
            if score < match_threshold:
                continue

            # Two ways to lock the spread; keep whichever is cheaper.
            cost_a = p.yes_ask + k.no_ask   # YES on Polymarket, NO on Kalshi
            cost_b = p.no_ask + k.yes_ask   # NO on Polymarket, YES on Kalshi

            if cost_a <= cost_b:
                leg_1, leg_2, cost = _leg(p, "YES"), _leg(k, "NO"), cost_a
            else:
                leg_1, leg_2, cost = _leg(p, "NO"), _leg(k, "YES"), cost_b

            if 0 < cost < 1.0 and (1.0 - cost) >= min_margin:
                opps.append(
                    _opportunity(
                        kind="cross",
                        leg_1=leg_1,
                        leg_2=leg_2,
                        question=p.title,
                        end_date=p.end_date or k.end_date,
                        match_score=score,
                    )
                )
    return opps


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

async def scan_arbitrage(
    limit: int | None = None,
    min_margin: float | None = None,
    match_threshold: float | None = None,
    include_cross: bool = True,
    query: str | None = None,
) -> PredictionArbitrageResponse:
    """Fetch both venues concurrently and return all arbitrage opportunities.

    Each venue is fetched independently — if one API fails, the scan still
    runs against the other. When `query` is given, only markets whose
    question contains that substring (case-insensitive) are considered,
    which sharply improves cross-venue match precision for a chosen topic.
    """
    limit = limit or settings.prediction_market_limit
    min_margin = settings.prediction_arb_min_margin if min_margin is None else min_margin
    match_threshold = (
        settings.prediction_match_threshold if match_threshold is None else match_threshold
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        poly_task = polymarket_service.fetch_markets(client, limit)
        kalshi_task = kalshi_service.fetch_markets(client, limit)
        poly_res, kalshi_res = await asyncio.gather(
            poly_task, kalshi_task, return_exceptions=True
        )

    poly = poly_res if isinstance(poly_res, list) else []
    kalshi = kalshi_res if isinstance(kalshi_res, list) else []
    if not isinstance(poly_res, list):
        logger.warning("Polymarket fetch failed: %s", poly_res)
    if not isinstance(kalshi_res, list):
        logger.warning("Kalshi fetch failed: %s", kalshi_res)

    if query:
        q = query.lower()
        poly = [m for m in poly if q in m.title.lower()]
        kalshi = [m for m in kalshi if q in m.title.lower()]

    opps = detect_intra_market_arbitrage(poly, min_margin)
    opps += detect_intra_market_arbitrage(kalshi, min_margin)
    if include_cross:
        opps += detect_cross_market_arbitrage(
            poly, kalshi, min_margin, match_threshold
        )

    # Best edge first.
    opps.sort(key=lambda o: o.profit_margin, reverse=True)

    logger.info(
        "Arbitrage scan: %d Polymarket + %d Kalshi markets → %d opportunities",
        len(poly), len(kalshi), len(opps),
    )
    return PredictionArbitrageResponse(
        polymarket_markets=len(poly),
        kalshi_markets=len(kalshi),
        opportunities=opps,
    )


# ---------------------------------------------------------------------------
# Frontend node conversion (so opportunities show in the 3D graph)
# ---------------------------------------------------------------------------

def _price_to_american(price: float) -> int:
    """Convert a probability price (0-1) to American odds."""
    price = min(max(price, 1e-4), 0.9999)
    decimal = 1.0 / price
    if decimal >= 2.0:
        return int(round((decimal - 1.0) * 100))
    return int(round(-100.0 / (decimal - 1.0)))


def opportunity_to_node(opp: PredictionArbitrageOpportunity) -> dict:
    """Map an arbitrage opportunity to the frontend node schema."""
    profit_score = round(min(max(opp.profit_margin, 0.0) / settings.profit_cap, 1.0), 4)
    # Confidence: how sure we are the legs are the same event (1.0 for intra).
    confidence = round(opp.match_score, 4)
    # Risk: cross-venue carries matching/resolution risk; intra is near-zero.
    base_risk = 0.10 if opp.kind == "intra" else 0.40
    risk_score = round(min(base_risk + (1.0 - confidence) * 0.5, 1.0), 4)
    # Volume proxy: scale the locked margin into a display size.
    volume = int(100 + max(opp.profit_margin, 0.0) * 5000)

    return {
        "category": opp.category,
        "home_team": f"{opp.leg_1.venue}:{opp.leg_1.side}",
        "away_team": f"{opp.leg_2.venue}:{opp.leg_2.side}",
        "profit_score": profit_score,
        "risk_score": risk_score,
        "confidence": confidence,
        "volume": volume,
        "date": opp.end_date,
        "market_type": opp.kind,
        "sportsbooks": [
            {"name": f"{opp.leg_1.venue} ({opp.leg_1.side})", "odds": _price_to_american(opp.leg_1.price)},
            {"name": f"{opp.leg_2.venue} ({opp.leg_2.side})", "odds": _price_to_american(opp.leg_2.price)},
        ],
    }
