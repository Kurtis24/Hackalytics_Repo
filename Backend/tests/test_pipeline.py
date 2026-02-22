"""
Full Pipeline Integration Test

Tests the complete flow:
  1. Games fetched from games service (NBA, MLB, NFL, NHL)
  2. Games sent to ML service (Databricks)
  3. ML returns nodes with predictions
  4. Nodes stored in nodes store (if store=True)
  5. Frontend retrieves nodes via /api/v1/nodes
  6. Recursive data flow verified

This test mocks external APIs (ESPN, MLB, NHL, Databricks) but tests the
actual integration between our routers and services.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.main import app
from app.models.game import Game
from app.routers.nodes import _nodes_store

client = TestClient(app)


# ---------------------------------------------------------------------------
# Test Data - Sample Games and ML Responses
# ---------------------------------------------------------------------------

SAMPLE_GAMES = [
    Game(
        category="basketball",
        home_team="Houston Rockets",
        away_team="New York Knicks",
        start_time="2026-02-25T19:30:00Z",
        live=0
    ),
    Game(
        category="baseball",
        home_team="New York Yankees",
        away_team="Boston Red Sox",
        start_time="2026-04-01T18:10:00Z",
        live=0
    ),
    Game(
        category="american_football",
        home_team="Kansas City Chiefs",
        away_team="Buffalo Bills",
        start_time="2026-09-10T20:20:00Z",
        live=0
    ),
    Game(
        category="hockey",
        home_team="Toronto Maple Leafs",
        away_team="Montreal Canadiens",
        start_time="2026-02-21T00:00:00Z",
        live=0
    ),
]


def mock_databricks_response(game: Game) -> dict:
    """Generate a mock Databricks response for a single game."""
    return {
        "predictions": [
            {
                "category": game.category,
                "home_team": game.home_team,
                "away_team": game.away_team,
                "date": game.start_time,
                "profit_score": 0.75,
                "risk_score": 0.30,
                "confidence": 0.85,
                "volume": 1500,
                "optimal_volume": 1500,
                "market_type": "spread",
                "sportsbooks": [
                    {"name": "DraftKings", "odds": 140},
                    {"name": "FanDuel", "odds": 135}
                ],
            }
        ]
    }


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def mock_settings():
    """Mock settings with Databricks credentials."""
    mock = MagicMock()
    mock.databricks_client_id = "test_client_id"
    mock.databricks_client_secret = "test_client_secret"
    mock.databricks_host = "https://test.databricks.com"
    mock.databricks_serving_endpoint = "test_endpoint"
    mock.ml_target_nodes = 150
    mock.ml_request_delay_seconds = 0
    return mock


# ---------------------------------------------------------------------------
# Pipeline Integration Tests
# ---------------------------------------------------------------------------

class TestFullPipeline:
    """Test the complete pipeline from games → ML → nodes → frontend."""

    def setup_method(self):
        """Clear nodes store before each test."""
        _nodes_store.clear()

    def teardown_method(self):
        """Clear nodes store after each test."""
        _nodes_store.clear()

    def test_pipeline_end_to_end_with_storage(self):
        """
        Test the complete pipeline:
        1. GET games from games service
        2. Send to ML (Databricks)
        3. Store nodes
        4. Retrieve via /api/v1/nodes
        """
        # Mock settings to provide Databricks credentials
        with patch("app.services.ml_service.settings", mock_settings()):
            # Mock games service to return sample games
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                # Mock Databricks client to return predictions for each game
                mock_client = MagicMock()

                # Return a different response for each game
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    # Run the ML pipeline with storage enabled
                    response = client.post("/api/v1/ml/run?store=true")

                # Verify the response
                assert response.status_code == 200
                nodes = response.json()

                # Should have 4 nodes (one per game)
                assert len(nodes) == 4

                # Verify node structure
                for node in nodes:
                    assert "category" in node
                    assert "home_team" in node
                    assert "away_team" in node
                    assert "profit_score" in node
                    assert "risk_score" in node
                    assert "confidence" in node
                    assert "volume" in node
                    assert "date" in node
                    assert "market_type" in node
                    assert "sportsbooks" in node

                # Verify nodes were stored
                stored_nodes = client.get("/api/v1/nodes").json()
                assert len(stored_nodes) == 4

                # Verify stored nodes match returned nodes
                assert stored_nodes == nodes

    def test_pipeline_without_storage(self):
        """Test pipeline with store=false - nodes should not be persisted."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    # Run without storage
                    response = client.post("/api/v1/ml/run?store=false")

                assert response.status_code == 200
                nodes = response.json()
                assert len(nodes) == 4

                # Verify nodes were NOT stored
                stored_nodes = client.get("/api/v1/nodes").json()
                assert len(stored_nodes) == 0

    def test_pipeline_handles_ml_failures_gracefully(self):
        """Test that individual game failures don't break the entire pipeline."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()

                # First game succeeds, second fails, third succeeds, fourth fails
                mock_client.query.side_effect = [
                    mock_databricks_response(SAMPLE_GAMES[0]),
                    Exception("Databricks timeout"),
                    mock_databricks_response(SAMPLE_GAMES[2]),
                    Exception("Network error"),
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")

                # Should still succeed with partial results
                assert response.status_code == 200
                nodes = response.json()

                # Should have 2 nodes (games 0 and 2)
                assert len(nodes) == 2
                assert nodes[0]["category"] == "basketball"
                assert nodes[1]["category"] == "american_football"

    def test_pipeline_returns_503_when_databricks_endpoint_stopped(self):
        """Test that pipeline returns 503 when Databricks endpoint is stopped."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = Exception("endpoint is stopped")

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")

                assert response.status_code == 503
                assert "stopped" in response.json()["detail"].lower()

    def test_pipeline_with_no_games_returns_empty_list(self):
        """Test pipeline when no games are available."""
        with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=[]):
            response = client.post("/api/v1/ml/run?store=true")

            assert response.status_code == 200
            assert response.json() == []

            # Verify nothing was stored
            stored_nodes = client.get("/api/v1/nodes").json()
            assert len(stored_nodes) == 0

    def test_pipeline_nodes_have_correct_sport_categories(self):
        """Verify that nodes maintain correct sport categories throughout pipeline."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                nodes = response.json()

                # Verify all sport categories are present
                categories = {node["category"] for node in nodes}
                assert categories == {"basketball", "baseball", "american_football", "hockey"}

    def test_pipeline_nodes_have_valid_score_ranges(self):
        """Verify that ML predictions produce valid score ranges."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                nodes = response.json()

                for node in nodes:
                    # Scores should be between 0 and 1
                    assert 0.0 <= node["profit_score"] <= 1.0
                    assert 0.0 <= node["risk_score"] <= 1.0
                    assert 0.0 <= node["confidence"] <= 1.0

                    # Volume should be positive
                    assert node["volume"] > 0


class TestPipelineRecursiveFlow:
    """Test recursive data flow and accumulation."""

    def setup_method(self):
        """Clear nodes store before each test."""
        _nodes_store.clear()

    def teardown_method(self):
        """Clear nodes store after each test."""
        _nodes_store.clear()

    def test_pipeline_can_be_run_multiple_times_accumulating_nodes(self):
        """Test that running pipeline multiple times accumulates nodes in store."""
        # First run with 2 games
        games_batch_1 = SAMPLE_GAMES[:2]
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=games_batch_1):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in games_batch_1
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                    assert response.status_code == 200
                    assert len(response.json()) == 2

        # Second run with 2 different games
        games_batch_2 = SAMPLE_GAMES[2:]
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=games_batch_2):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in games_batch_2
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                    assert response.status_code == 200
                    assert len(response.json()) == 2

        # Verify total accumulated nodes
        stored_nodes = client.get("/api/v1/nodes").json()
        assert len(stored_nodes) == 4

    def test_pipeline_nodes_can_be_cleared_and_rerun(self):
        """Test that nodes can be cleared and pipeline rerun."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    # First run
                    response = client.post("/api/v1/ml/run?store=true")
                    assert len(response.json()) == 4

                    # Clear nodes
                    clear_response = client.delete("/api/v1/nodes")
                    assert clear_response.status_code == 200

                    # Verify cleared
                    assert len(client.get("/api/v1/nodes").json()) == 0

        # Run again with fresh mock
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                    assert len(response.json()) == 4


class TestPipelineDataIntegrity:
    """Test that data maintains integrity throughout the pipeline."""

    def setup_method(self):
        """Clear nodes store before each test."""
        _nodes_store.clear()

    def teardown_method(self):
        """Clear nodes store after each test."""
        _nodes_store.clear()

    def test_team_names_preserved_through_pipeline(self):
        """Verify team names are correctly preserved from games → ML → nodes."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                nodes = response.json()

                # Verify each node has matching team names from original games
                for i, node in enumerate(nodes):
                    assert node["home_team"] == SAMPLE_GAMES[i].home_team
                    assert node["away_team"] == SAMPLE_GAMES[i].away_team

    def test_dates_preserved_through_pipeline(self):
        """Verify dates/times are correctly preserved throughout pipeline."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                nodes = response.json()

                # Verify dates are preserved
                for i, node in enumerate(nodes):
                    assert node["date"] == SAMPLE_GAMES[i].start_time

    def test_sportsbooks_data_preserved(self):
        """Verify sportsbook information is correctly passed through."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    response = client.post("/api/v1/ml/run?store=true")
                    nodes = response.json()

                    for node in nodes:
                        assert "sportsbooks" in node
                        assert isinstance(node["sportsbooks"], list)
                        # Our mock returns SportsbookEntry objects
                        assert len(node["sportsbooks"]) == 2
                        assert node["sportsbooks"][0]["name"] == "DraftKings"
                        assert node["sportsbooks"][1]["name"] == "FanDuel"


# ---------------------------------------------------------------------------
# Frontend Integration Tests
# ---------------------------------------------------------------------------

class TestFrontendIntegration:
    """Test that frontend can properly consume pipeline output."""

    def setup_method(self):
        """Clear nodes store before each test."""
        _nodes_store.clear()

    def teardown_method(self):
        """Clear nodes store after each test."""
        _nodes_store.clear()

    def test_frontend_can_fetch_nodes_after_pipeline_run(self):
        """Test frontend retrieval of nodes via GET /api/v1/nodes."""
        with patch("app.services.ml_service.settings", mock_settings()):
            with patch("app.services.ml_service.get_games_for_ml", new_callable=AsyncMock, return_value=SAMPLE_GAMES):
                mock_client = MagicMock()
                mock_client.query.side_effect = [
                    mock_databricks_response(game) for game in SAMPLE_GAMES
                ]

                with patch("app.services.ml_service.DatabricksServingClient", return_value=mock_client):
                    # Backend runs pipeline
                    client.post("/api/v1/ml/run?store=true")

                # Frontend fetches nodes
                frontend_response = client.get("/api/v1/nodes")

                assert frontend_response.status_code == 200
                nodes = frontend_response.json()
                assert len(nodes) == 4

                # Verify frontend gets all required fields for rendering
                for node in nodes:
                    # Fields needed for 3D visualization
                    assert "profit_score" in node  # Y-axis
                    assert "risk_score" in node    # Z-axis
                    assert "confidence" in node    # X-axis
                    assert "volume" in node        # Node size
                    assert "category" in node      # Node color

                    # Fields for display/filtering
                    assert "home_team" in node
                    assert "away_team" in node
                    assert "date" in node
                    assert "market_type" in node
                    assert "sportsbooks" in node

    def test_frontend_can_bulk_add_nodes(self):
        """Test that frontend can bulk add nodes via POST /api/v1/nodes/bulk."""
        # Manually create some nodes with correct SportsbookEntry format
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

        # Frontend sends bulk nodes
        response = client.post("/api/v1/nodes/bulk", json=custom_nodes)
        assert response.status_code == 200

        # Verify they were stored
        stored_nodes = client.get("/api/v1/nodes").json()
        assert len(stored_nodes) == 1
        assert stored_nodes[0]["home_team"] == "Test Team 1"
