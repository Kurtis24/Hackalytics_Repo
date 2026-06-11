"""
Models for prediction-market data (Polymarket + Kalshi) and the
cross-/intra-venue arbitrage opportunities derived from them.

All prices are expressed as probabilities in dollars (0.0 – 1.0), i.e.
the cost to buy one share that pays out $1 if the outcome resolves true.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class PredictionMarketQuote(BaseModel):
    """A single binary (Yes/No) market normalised across venues."""

    venue: str                 # "polymarket" | "kalshi"
    market_id: str             # slug (Polymarket) or ticker (Kalshi)
    title: str                 # human-readable question
    category: str = "prediction_market"

    # Executable prices (cost to BUY a share), in dollars 0.0 – 1.0.
    yes_ask: float             # cost to buy YES
    no_ask: float              # cost to buy NO
    yes_bid: float = 0.0       # best price to SELL YES
    no_bid: float = 0.0        # best price to SELL NO

    end_date: str = ""         # ISO 8601 resolution/close time
    volume: float = 0.0        # 24h or total traded volume (venue-defined)
    url: str = ""              # link to the market


class ArbitrageLeg(BaseModel):
    """One side of an arbitrage trade."""

    venue: str
    market_id: str
    title: str
    side: str                  # "YES" | "NO"
    price: float               # cost to buy this side (dollars)
    url: str = ""


class PredictionArbitrageOpportunity(BaseModel):
    """A guaranteed-profit (or near-zero-cost) two-leg position."""

    kind: str                  # "intra" (same venue) | "cross" (across venues)
    question: str              # representative question text
    category: str = "prediction_market"

    leg_1: ArbitrageLeg
    leg_2: ArbitrageLeg

    total_cost: float          # leg_1.price + leg_2.price (dollars per $1 payout)
    profit_margin: float       # 1 - total_cost (guaranteed profit per $1 payout)
    roi_pct: float             # profit_margin / total_cost * 100
    match_score: float = 1.0   # title-similarity for cross-venue matches (1.0 for intra)

    # True for cross-venue matches: the two legs are paired by question
    # similarity, NOT a verified identical event — confirm both questions
    # resolve on the same real-world outcome before trading.
    requires_verification: bool = False

    end_date: str = ""


class PredictionArbitrageResponse(BaseModel):
    """Top-level response for the arbitrage scan."""

    polymarket_markets: int
    kalshi_markets: int
    opportunities: list[PredictionArbitrageOpportunity] = Field(default_factory=list)
