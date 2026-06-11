"""
Tests for the Polymarket + Kalshi prediction-market arbitrage logic.

These use synthetic quotes so they're deterministic and offline — no
live API calls. They cover the price normalisation math, intra-/cross-
venue detection, the false-positive guard, and node conversion.
"""

from app.models.prediction_market import PredictionMarketQuote
from app.services import polymarket_service, kalshi_service
from app.services.prediction_arbitrage_service import (
    detect_cross_market_arbitrage,
    detect_intra_market_arbitrage,
    opportunity_to_node,
    _match_score,
)


# ---------------------------------------------------------------------------
# Venue normalisation
# ---------------------------------------------------------------------------

def test_polymarket_normalisation():
    """Gamma's JSON-string fields and best bid/ask map to Yes/No prices."""
    raw = {
        "slug": "btc-150k",
        "question": "Will Bitcoin reach $150k?",
        "outcomes": '["Yes", "No"]',
        "acceptingOrders": True,
        "bestBid": 0.40,
        "bestAsk": 0.42,
        "endDate": "2026-12-31T00:00:00Z",
        "volume24hr": 1000.0,
    }
    q = polymarket_service._to_quote(raw)
    assert q is not None
    assert q.venue == "polymarket"
    assert q.yes_ask == 0.42
    # NO ask ≈ 1 − best YES bid
    assert q.no_ask == round(1 - 0.40, 4)


def test_polymarket_skips_non_binary_and_unpriced():
    assert polymarket_service._to_quote(
        {"outcomes": '["A","B","C"]', "acceptingOrders": True, "bestBid": 0.3, "bestAsk": 0.4}
    ) is None
    assert polymarket_service._to_quote(
        {"outcomes": '["Yes","No"]', "acceptingOrders": False, "bestBid": 0.3, "bestAsk": 0.4}
    ) is None


def test_kalshi_normalisation_and_filters():
    raw = {
        "ticker": "FED-25",
        "title": "Will the Fed cut rates?",
        "status": "active",
        "market_type": "binary",
        "yes_ask_dollars": "0.55",
        "no_ask_dollars": "0.48",
        "yes_bid_dollars": "0.53",
        "no_bid_dollars": "0.45",
        "close_time": "2026-09-01T00:00:00Z",
    }
    q = kalshi_service._to_quote(raw)
    assert q is not None
    assert q.yes_ask == 0.55 and q.no_ask == 0.48

    # Multivariate parlay markets are rejected.
    assert kalshi_service._to_quote({**raw, "mve_selected_legs": [{"x": 1}]}) is None
    # Provisional markets are rejected.
    assert kalshi_service._to_quote({**raw, "is_provisional": True}) is None


# ---------------------------------------------------------------------------
# Intra-venue arbitrage
# ---------------------------------------------------------------------------

def _quote(venue, mid, title, yes_ask, no_ask):
    return PredictionMarketQuote(
        venue=venue, market_id=mid, title=title,
        yes_ask=yes_ask, no_ask=no_ask,
        yes_bid=round(1 - no_ask, 4), no_bid=round(1 - yes_ask, 4),
    )


def test_intra_arbitrage_detected_when_under_one_dollar():
    quotes = [_quote("kalshi", "K1", "Will it rain?", 0.45, 0.50)]  # 0.95 < 1
    opps = detect_intra_market_arbitrage(quotes, min_margin=0.0)
    assert len(opps) == 1
    assert opps[0].kind == "intra"
    assert opps[0].profit_margin == round(1 - 0.95, 4)
    assert opps[0].requires_verification is False


def test_intra_arbitrage_skipped_when_priced_at_or_above_one():
    quotes = [_quote("kalshi", "K2", "Will it snow?", 0.55, 0.50)]  # 1.05 ≥ 1
    assert detect_intra_market_arbitrage(quotes, min_margin=0.0) == []


def test_intra_min_margin_filters_thin_edges():
    quotes = [_quote("polymarket", "P1", "Coin flip?", 0.49, 0.50)]  # margin 0.01
    assert detect_intra_market_arbitrage(quotes, min_margin=0.05) == []
    assert len(detect_intra_market_arbitrage(quotes, min_margin=0.0)) == 1


# ---------------------------------------------------------------------------
# Cross-venue arbitrage + false-positive guard
# ---------------------------------------------------------------------------

def test_cross_arbitrage_matches_same_event():
    poly = [_quote("polymarket", "P", "Will Bitcoin reach $150,000 in 2026?", 0.40, 0.62)]
    kalshi = [_quote("kalshi", "K", "Will Bitcoin reach $150,000 in 2026?", 0.55, 0.45)]
    # Best cross combo: Poly YES (0.40) + Kalshi NO (0.45) = 0.85 < 1
    opps = detect_cross_market_arbitrage(poly, kalshi, min_margin=0.0, match_threshold=0.6)
    assert len(opps) == 1
    assert opps[0].kind == "cross"
    assert opps[0].requires_verification is True
    assert opps[0].total_cost == 0.85


def test_cross_arbitrage_rejects_different_events():
    """Superficial word overlap must NOT be treated as the same event."""
    poly = [_quote("polymarket", "P", "Will the San Antonio Spurs win the 2026 NBA Finals?", 0.10, 0.92)]
    kalshi = [_quote("kalshi", "K", "Will San Antonio win the 2nd half by over 5.5 points?", 0.30, 0.40)]
    opps = detect_cross_market_arbitrage(poly, kalshi, min_margin=0.0, match_threshold=0.6)
    assert opps == []


def test_match_score_floor():
    # Identical questions → high score
    assert _match_score("Will Bitcoin hit 150k?", "Will Bitcoin hit 150k?") >= 0.9
    # Different events sharing a city name → below threshold (jaccard floor)
    assert _match_score(
        "Will the San Antonio Spurs win the 2026 NBA Finals?",
        "Will San Antonio win the 2nd half by over 5.5 points?",
    ) < 0.6


# ---------------------------------------------------------------------------
# Node conversion
# ---------------------------------------------------------------------------

def test_opportunity_to_node_shape():
    poly = [_quote("polymarket", "P", "Will Bitcoin reach $150,000 in 2026?", 0.40, 0.62)]
    kalshi = [_quote("kalshi", "K", "Will Bitcoin reach $150,000 in 2026?", 0.55, 0.45)]
    opp = detect_cross_market_arbitrage(poly, kalshi, min_margin=0.0, match_threshold=0.6)[0]
    node = opportunity_to_node(opp)
    for key in ("category", "home_team", "away_team", "profit_score", "risk_score",
                "confidence", "volume", "date", "market_type", "sportsbooks"):
        assert key in node
    assert len(node["sportsbooks"]) == 2
    assert 0.0 <= node["profit_score"] <= 1.0
    assert 0.0 <= node["risk_score"] <= 1.0
