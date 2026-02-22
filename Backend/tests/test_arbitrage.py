"""
Tests for the arbitrage GET endpoints — PRD v3 Volume Optimization.

Both endpoints have zero parameters; they fetch internally from ml_service.
We mock fetch_prediction so no real HTTP call is made.

PRD v3 behaviour changes:
  - Markets without a true arb margin are dropped at the profit floor check.
  - The sample payload only has 1 passing market (spread +140/+135).
  - Moneyline and points_total have no guaranteed edge → kelly_stake=0 → dropped.
  - Output includes three new diagnostic fields: line_movement, market_ceiling, kelly_stake.
  - `total_stake` is replaced by `optimal_volume`.
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


def spread_only_payload(confidence=0.65):
    """Return a payload containing only the spread market."""
    market = {**SAMPLE_PAYLOAD["markets"][0], "confidence": confidence}
    return {**SAMPLE_PAYLOAD, "markets": [market]}


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

    def test_requires_no_query_parameters(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.status_code == 200

    def test_sample_produces_one_opportunity(self):
        """
        Sample has 3 markets, but only the spread (+140/+135) is a true arb.
        Moneyline and points_total have no guaranteed edge → dropped at floor check.
        """
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        assert len(r.json()) == 1

    def test_spread_is_the_passing_market(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        assert opps[0]["market_type"] == "spread"

    def test_each_opportunity_has_required_fields(self):
        required = {
            "category", "date", "home_team", "away_team",
            "market_type", "confidence", "profit_score", "risk_score",
            "optimal_volume", "stake_book1", "stake_book2",
            "guaranteed_profit", "sportsbooks",
            # PRD v3 diagnostic fields
            "line_movement", "market_ceiling", "kelly_stake",
        }
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        for opp in r.json():
            assert required <= set(opp.keys()), f"Missing: {required - set(opp.keys())}"

    def test_total_stake_field_is_removed(self):
        """total_stake is superseded by optimal_volume in PRD v3."""
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        for opp in r.json():
            assert "total_stake" not in opp

    def test_live_field_is_never_present(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/opportunities")
        for opp in r.json():
            assert "live" not in opp

    def test_spread_is_true_arb_with_positive_profit_score(self):
        """Spread +140/+135 → arb_margin > 0 → profit_score must be > 0."""
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        spread = next(o for o in opps if o["market_type"] == "spread")
        assert spread["profit_score"] > 0
        assert spread["guaranteed_profit"] >= settings_min_profit_floor()

    def test_guaranteed_profit_meets_floor(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert o["guaranteed_profit"] >= 5  # MIN_PROFIT_FLOOR default

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

    def test_optimal_volume_close_to_sum_of_book_stakes(self):
        """Rounding may cause ±1 difference between optimal_volume and stake sum."""
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            stake_sum = o["stake_book1"] + o["stake_book2"]
            assert abs(o["optimal_volume"] - stake_sum) <= 1

    # ── Diagnostic fields ────────────────────────────────────────────────

    def test_line_movement_is_non_negative_float(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert isinstance(o["line_movement"], float)
            assert o["line_movement"] >= 0.0

    def test_market_ceiling_is_positive_int(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert isinstance(o["market_ceiling"], int)
            assert o["market_ceiling"] > 0

    def test_kelly_stake_is_positive_for_true_arb(self):
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        spread = next(o for o in opps if o["market_type"] == "spread")
        assert spread["kelly_stake"] > 0

    def test_optimal_volume_is_leq_kelly_and_ceiling_and_bankroll_cap(self):
        """optimal_volume must be the minimum of the three constraints."""
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        for o in opps:
            assert o["optimal_volume"] <= o["kelly_stake"]
            assert o["optimal_volume"] <= o["market_ceiling"]

    # ── Confidence filter ────────────────────────────────────────────────

    def test_market_below_confidence_threshold_is_excluded(self):
        """Confidence 0.50 < 0.60 threshold → dropped before floor check."""
        low_conf = spread_only_payload(confidence=0.50)
        with mock_fetch(low_conf):
            r = client.get("/api/v1/arbitrage/opportunities")
        assert r.json() == []

    def test_confidence_exactly_at_threshold_is_included(self):
        """Confidence == 0.60 passes (>= not >)."""
        at_threshold = spread_only_payload(confidence=0.60)
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

    def test_requires_no_query_parameters(self):
        with mock_fetch():
            r = client.get("/api/v1/arbitrage/analysis")
        assert r.status_code == 200

    def test_response_has_required_fields(self):
        required = {
            "total_opportunities", "confirmed_arbs", "value_bets",
            "total_capital_required", "expected_total_profit",
            "avg_profit_score", "avg_risk_score",
            "risk_distribution", "ranked_opportunities",
        }
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert required <= set(body.keys())

    def test_sample_counts_one_opportunity(self):
        """Only the spread passes the floor check in the sample."""
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["total_opportunities"] == 1
        assert body["confirmed_arbs"] == 1
        assert body["value_bets"] == 0

    def test_capital_required_is_positive(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["total_capital_required"] > 0

    def test_expected_profit_is_positive(self):
        """Spread has a genuine arb margin — profit must be > 0."""
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["expected_total_profit"] > 0

    def test_risk_distribution_sums_to_total(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        rd = body["risk_distribution"]
        total = rd["low"] + rd["moderate"] + rd["elevated"] + rd["high"]
        assert total == body["total_opportunities"]

    def test_ranked_opportunities_sorted_by_profit_desc(self):
        with mock_fetch():
            ranked = client.get("/api/v1/arbitrage/analysis").json()["ranked_opportunities"]
        scores = [o["profit_score"] for o in ranked]
        assert scores == sorted(scores, reverse=True)

    def test_best_opportunity_is_spread(self):
        with mock_fetch():
            body = client.get("/api/v1/arbitrage/analysis").json()
        assert body["best_opportunity"]["market_type"] == "spread"
        assert body["best_opportunity"]["profit_score"] == 1.0

    def test_best_opportunity_has_diagnostic_fields(self):
        with mock_fetch():
            best = client.get("/api/v1/arbitrage/analysis").json()["best_opportunity"]
        assert "line_movement" in best
        assert "market_ceiling" in best
        assert "kelly_stake" in best

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


# ---------------------------------------------------------------------------
# POST /api/v1/arbitrage/execute
# ---------------------------------------------------------------------------

EXECUTE_MOCK_PATH = "app.routers.arbitrage.fetch_all_predictions"


def mock_fetch_all(payloads=None):
    return patch(
        EXECUTE_MOCK_PATH,
        new_callable=AsyncMock,
        return_value=payloads if payloads is not None else [SAMPLE_PAYLOAD],
    )


class TestExecutePipeline:
    """End-to-end tests for the Execute Backend pipeline (POST /arbitrage/execute)."""

    def test_returns_200(self):
        with mock_fetch_all():
            r = client.post("/api/v1/arbitrage/execute")
        assert r.status_code == 200

    def test_returns_a_list(self):
        with mock_fetch_all():
            r = client.post("/api/v1/arbitrage/execute")
        assert isinstance(r.json(), list)

    def test_sample_produces_three_nodes(self):
        """Sample payload has 3 markets → 3 nodes (one per market)."""
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        assert len(nodes) == 3

    def test_each_node_has_required_fields(self):
        required = {
            "category", "home_team", "away_team",
            "profit_score", "risk_score", "confidence",
            "volume", "date", "market_type", "sportsbooks",
        }
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for node in nodes:
            assert required <= set(node.keys()), f"Missing: {required - set(node.keys())}"

    def test_profit_score_between_0_and_1(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            assert 0.0 <= n["profit_score"] <= 1.0

    def test_risk_score_between_0_and_1(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            assert 0.0 <= n["risk_score"] <= 1.0

    def test_confidence_between_0_and_1(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            assert 0.0 <= n["confidence"] <= 1.0

    def test_sportsbooks_has_two_entries(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            assert len(n["sportsbooks"]) == 2

    def test_sportsbook_entries_have_name_and_odds(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            for sb in n["sportsbooks"]:
                assert "name" in sb
                assert "odds" in sb

    def test_market_types_from_sample(self):
        """Sample payload has spread, points_total, moneyline."""
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        types = {n["market_type"] for n in nodes}
        assert types == {"spread", "points_total", "moneyline"}

    def test_home_away_teams_propagated(self):
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        for n in nodes:
            assert n["home_team"] == "Houston Rockets"
            assert n["away_team"] == "New York Knicks"

    def test_no_filtering_unlike_opportunities(self):
        """Execute returns ALL markets — even non-arb ones that /opportunities drops."""
        with mock_fetch_all():
            exec_nodes = client.post("/api/v1/arbitrage/execute").json()
        with mock_fetch():
            opps = client.get("/api/v1/arbitrage/opportunities").json()
        # /execute returns more (all 3 markets) vs /opportunities (only 1 arb)
        assert len(exec_nodes) > len(opps)

    def test_multiple_games_produce_multiple_nodes(self):
        """Two game payloads × 3 markets each = 6 nodes."""
        second_game = {
            **SAMPLE_PAYLOAD,
            "home_team": "LA Lakers",
            "away_team": "Boston Celtics",
            "date": "2023-01-11T19:00:00Z",
        }
        with mock_fetch_all([SAMPLE_PAYLOAD, second_game]):
            nodes = client.post("/api/v1/arbitrage/execute").json()
        assert len(nodes) == 6

    def test_empty_predictions_returns_empty_list(self):
        with mock_fetch_all([]):
            nodes = client.post("/api/v1/arbitrage/execute").json()
        assert nodes == []

    def test_game_with_no_markets_returns_empty(self):
        no_markets = {**SAMPLE_PAYLOAD, "markets": []}
        with mock_fetch_all([no_markets]):
            nodes = client.post("/api/v1/arbitrage/execute").json()
        assert nodes == []

    def test_returns_500_on_service_error(self):
        with patch(EXECUTE_MOCK_PATH, new_callable=AsyncMock, side_effect=Exception("boom")):
            r = client.post("/api/v1/arbitrage/execute")
        assert r.status_code == 500

    def test_spread_market_has_positive_profit_score(self):
        """Spread +140/+135 is a true arb — profit_score must be > 0."""
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        spread = next(n for n in nodes if n["market_type"] == "spread")
        assert spread["profit_score"] > 0

    def test_moneyline_non_arb_has_zero_profit_score(self):
        """Moneyline -120/+115 is not a true arb — profit_score should be 0."""
        with mock_fetch_all():
            nodes = client.post("/api/v1/arbitrage/execute").json()
        ml = next(n for n in nodes if n["market_type"] == "moneyline")
        assert ml["profit_score"] == 0


# ---------------------------------------------------------------------------
# Helper used inside test methods
# ---------------------------------------------------------------------------

def settings_min_profit_floor() -> int:
    from app.config import settings
    return settings.min_profit_floor
