"""
Tests for the arbitrage GET endpoints.

Both endpoints have zero parameters — they fetch internally from ml_service.
We mock fetch_prediction so no real HTTP call is made.
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.ml_service import SAMPLE_PAYLOAD

client = TestClient(app)

MOCK_PATH = "app.routers.arbitrage.fetch_prediction"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def mock_fetch(payload=None):
    return patch(MOCK_PATH, new_callable=AsyncMock, return_value=payload or SAMPLE_PAYLOAD)


# ---------------------------------------------------------------------------
# GET /api/v1/arbitrage/opportunities
# ---------------------------------------------------------------------------

class TestOpportunitiesEndpoint:

    def test_returns_200(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.status_code == 200

    def test_returns_a_list(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert isinstance(r.json(), list)

    def test_has_no_query_parameters_needed(self):
        """Endpoint must respond without any query params."""
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.status_code == 200

    def test_each_opportunity_has_required_fields(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        required = {"category", "date", "home_team", "away_team",
                    "market_type", "confidence", "profit_score",
                    "risk_score", "stake_book1", "stake_book2",
                    "total_stake", "guaranteed_profit", "sportsbooks"}
        for opp in r.json():
            assert required <= set(opp.keys())

    def test_live_field_is_never_present(self):
        """live is a Game field, not an ArbitrageOpportunity field."""
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        for opp in r.json():
            assert "live" not in opp

    def test_sample_produces_three_opportunities(self):
        """Sample payload has 3 markets all above 0.60 — all three should pass."""
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert len(r.json()) == 3

    def test_spread_market_is_true_arb(self):
        """Spread +140/+135 has totalImplied < 1 — profit_score must be > 0."""
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        spread = next(o for o in opps if o["market_type"] == "spread")
        assert spread["profit_score"] > 0
        assert spread["guaranteed_profit"] > 0

    def test_moneyline_is_value_bet(self):
        """Moneyline -120/+115 has totalImplied > 1 — profit_score must be 0."""
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        ml = next(o for o in opps if o["market_type"] == "moneyline")
        assert ml["profit_score"] == 0.0

    def test_risk_score_is_between_0_and_1(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert 0.0 <= o["risk_score"] <= 1.0

    def test_profit_score_is_between_0_and_1(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert 0.0 <= o["profit_score"] <= 1.0

    def test_sportsbooks_has_two_entries(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert len(o["sportsbooks"]) == 2

    def test_total_stake_equals_sum_of_book_stakes(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert o["total_stake"] == o["stake_book1"] + o["stake_book2"]

    def test_guaranteed_profit_is_not_negative(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert o["guaranteed_profit"] >= 0

    def test_market_below_confidence_threshold_is_excluded(self):
        """A market with confidence 0.50 (< 0.60) must be dropped."""
        low_confidence_payload = {**SAMPLE_PAYLOAD, "markets": [
            {**SAMPLE_PAYLOAD["markets"][0], "confidence": 0.50}
        ]}
        with mock_fetch(low_confidence_payload):
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.json() == []

    def test_confidence_exactly_at_threshold_is_included(self):
        """Confidence == 0.60 must be included (>= not >)."""
        at_threshold = {**SAMPLE_PAYLOAD, "markets": [
            {**SAMPLE_PAYLOAD["markets"][0], "confidence": 0.60}
        ]}
        with mock_fetch(at_threshold):
            r = client.get("/api/v1/arbitrage/opportunities")
        assert len(r.json()) == 1

    def test_returns_empty_list_when_all_markets_below_threshold(self):
        no_pass = {**SAMPLE_PAYLOAD, "markets": [
            {**m, "confidence": 0.30} for m in SAMPLE_PAYLOAD["markets"]
        ]}
        with mock_fetch(no_pass):
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.json() == []

    def test_returns_500_on_unexpected_service_error(self):
        with patch(MOCK_PATH, new_callable=AsyncMock, side_effect=Exception("boom")):
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# GET /api/v1/arbitrage/analysis
# ---------------------------------------------------------------------------

class TestAnalysisEndpoint:

    def test_returns_200(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/analysis")
        assert r.status_code == 200

    def test_has_no_query_parameters_needed(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/analysis")
        assert r.status_code == 200

    def test_response_has_required_fields(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        required = {
            "total_opportunities", "confirmed_arbs", "value_bets",
            "total_capital_required", "expected_total_profit",
            "avg_profit_score", "avg_risk_score",
            "risk_distribution", "ranked_opportunities",
        }
        assert required <= set(body.keys())

    def test_counts_are_correct_for_sample(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["total_opportunities"] == 3
        assert body["confirmed_arbs"] == 1      # spread only
        assert body["value_bets"] == 2           # moneyline + points_total

    def test_capital_required_is_positive(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["total_capital_required"] > 0

    def test_expected_profit_matches_spread_arb(self):
        """Only the spread is a true arb — expected profit must be > 0."""
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["expected_total_profit"] > 0

    def test_risk_distribution_sums_to_total(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        rd = body["risk_distribution"]
        assert rd["low"] + rd["moderate"] + rd["elevated"] + rd["high"] == body["total_opportunities"]

    def test_ranked_opportunities_sorted_by_profit_desc(self):
        with mock_fetch():
            ranked = client.get("/api/v1/arbitrage/analysis").json()["ranked_opportunities"]
        scores = [o["profit_score"] for o in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_best_opportunity_is_spread(self):
        """Spread has profit_score=1.0 — must be best opportunity."""
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["best_opportunity"]["market_type"] == "spread"
        assert body["best_opportunity"]["profit_score"] == 1.0

    def test_empty_when_no_markets_pass(self):
        no_pass = {**SAMPLE_PAYLOAD, "markets": [
            {**m, "confidence": 0.10} for m in SAMPLE_PAYLOAD["markets"]
        ]}
        with mock_fetch(no_pass):
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["total_opportunities"] == 0
        assert body["best_opportunity"] is None
        assert body["ranked_opportunities"] == []

    def test_returns_500_on_unexpected_service_error(self):
        with patch(MOCK_PATH, new_callable=AsyncMock, side_effect=Exception("boom")):
            r = client.get("/api/v1/arbitrage/analysis")
        assert r.status_code == 500
