"""
Pipeline Integration Test (native local model)

Tests the in-process flow:
  1. POST /ml/run runs the local ML pipeline (fetch_all_predictions)
  2. With store=true, payloads are appended to the in-memory nodes store
  3. POST /nodes/bulk accepts externally supplied nodes
  4. DELETE /nodes clears the store

The local model pipeline is mocked so the test stays deterministic and
offline (no live sports APIs, no model checkpoint required).
"""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.routers.nodes import _nodes_store

client = TestClient(app)


# ---------------------------------------------------------------------------
# Sample prediction payloads (shape returned by fetch_all_predictions)
# ---------------------------------------------------------------------------

SAMPLE_PAYLOADS = [
    {
        "category": "basketball",
        "date": "2026-02-25T19:30:00Z",
        "home_team": "Houston Rockets",
        "away_team": "New York Knicks",
        "markets": [
            {
                "market_type": "spread",
                "confidence": 0.85,
                "bookmaker_1": "DraftKings",
                "bookmaker_2": "FanDuel",
                "price_1": 140,
                "price_2": 135,
                "prediction": "home_team +3.5",
            }
        ],
    },
    {
        "category": "hockey",
        "date": "2026-02-21T00:00:00Z",
        "home_team": "Toronto Maple Leafs",
        "away_team": "Montreal Canadiens",
        "markets": [
            {
                "market_type": "moneyline",
                "confidence": 0.72,
                "bookmaker_1": "DraftKings",
                "bookmaker_2": "ESPNBet",
                "price_1": -120,
                "price_2": 115,
                "prediction": "home_team wins",
            }
        ],
    },
]


class TestNativePipeline:
    """Test the local ML pipeline end-to-end via the API."""

    def setup_method(self):
        _nodes_store.clear()

    def teardown_method(self):
        _nodes_store.clear()

    def test_ml_run_returns_predictions(self):
        """POST /ml/run returns the local model's prediction payloads."""
        with patch(
            "app.routers.ml.fetch_all_predictions",
            new=AsyncMock(return_value=SAMPLE_PAYLOADS),
        ):
            response = client.post("/api/v1/ml/run?store=false")

        assert response.status_code == 200
        payloads = response.json()
        assert len(payloads) == 2

        for payload in payloads:
            assert "category" in payload
            assert "home_team" in payload
            assert "away_team" in payload
            assert "markets" in payload

    def test_ml_run_stores_payloads_when_requested(self):
        """store=true appends payloads to the in-memory nodes store."""
        with patch(
            "app.routers.ml.fetch_all_predictions",
            new=AsyncMock(return_value=SAMPLE_PAYLOADS),
        ):
            response = client.post("/api/v1/ml/run?store=true")

        assert response.status_code == 200
        assert len(_nodes_store) == 2

    def test_ml_run_does_not_store_by_default_when_false(self):
        """store=false leaves the nodes store untouched."""
        with patch(
            "app.routers.ml.fetch_all_predictions",
            new=AsyncMock(return_value=SAMPLE_PAYLOADS),
        ):
            client.post("/api/v1/ml/run?store=false")

        assert len(_nodes_store) == 0

    def test_ml_run_accumulates_across_runs(self):
        """Running the pipeline multiple times accumulates stored payloads."""
        with patch(
            "app.routers.ml.fetch_all_predictions",
            new=AsyncMock(return_value=SAMPLE_PAYLOADS),
        ):
            client.post("/api/v1/ml/run?store=true")
            client.post("/api/v1/ml/run?store=true")

        assert len(_nodes_store) == 4


class TestNodesStore:
    """Test the nodes store bulk-accept and clear endpoints."""

    def setup_method(self):
        _nodes_store.clear()

    def teardown_method(self):
        _nodes_store.clear()

    def test_bulk_add_nodes(self):
        """POST /nodes/bulk accepts a list of nodes and reports the count."""
        custom_nodes = [
            {
                "category": "basketball",
                "home_team": "Test Team 1",
                "away_team": "Test Team 2",
                "profit_score": 0.8,
                "risk_score": 0.2,
                "confidence": 0.9,
                "volume": 2000,
                "date": "2026-03-01T20:00:00Z",
                "market_type": "moneyline",
                "sportsbooks": [{"name": "Bet365", "odds": 150}],
            }
        ]

        response = client.post("/api/v1/nodes/bulk", json=custom_nodes)
        assert response.status_code == 200

        body = response.json()
        assert body["accepted"] == 1
        assert body["total"] == 1
        assert len(_nodes_store) == 1
        assert _nodes_store[0]["home_team"] == "Test Team 1"

    def test_clear_nodes(self):
        """DELETE /nodes empties the store."""
        custom_nodes = [
            {
                "category": "hockey",
                "home_team": "A",
                "away_team": "B",
                "profit_score": 0.5,
                "risk_score": 0.5,
                "confidence": 0.5,
                "volume": 100,
                "date": "2026-03-01T20:00:00Z",
                "market_type": "moneyline",
                "sportsbooks": [{"name": "FanDuel", "odds": 120}],
            }
        ]
        client.post("/api/v1/nodes/bulk", json=custom_nodes)
        assert len(_nodes_store) == 1

        response = client.delete("/api/v1/nodes")
        assert response.status_code == 200
        assert response.json()["cleared"] == 1
        assert len(_nodes_store) == 0
