"""
Test that the ML pipeline fetches games from sports APIs when Databricks is not configured.

This test verifies:
1. fetch_upcoming_games() fetches from sports APIs when Databricks is unavailable
2. Returns the expected number of games (ml_target_nodes)
3. Games have proper categories (basketball, baseball, hockey, american_football)
4. Each game has odds data so the ML model can process it
5. The full ML pipeline can process the games
"""

import pytest
from unittest.mock import patch, MagicMock

from app.services.delta_lake_service import (
    fetch_upcoming_games,
    fetch_odds_for_games,
    _databricks_available,
)
from app.services.ml_service import fetch_all_predictions
from app.config import settings


class TestSportsAPIIntegration:
    """Test sports API integration when Databricks is not available."""

    def test_databricks_not_configured(self):
        """Verify Databricks is not configured in test environment."""
        assert not _databricks_available(), "Databricks should not be configured in tests"

    def test_fetch_upcoming_games_from_sports_apis(self):
        """Test that fetch_upcoming_games fetches from sports APIs."""
        # Clear the cache to force a fresh fetch
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        games = fetch_upcoming_games()

        # Should fetch more than 2 sample games
        assert len(games) > 2, f"Expected > 2 games from sports APIs, got {len(games)}"

        # Should fetch up to 150 games (target)
        assert len(games) <= 150, \
            f"Expected <= 150 games, got {len(games)}"

    def test_games_have_required_fields(self):
        """Test that fetched games have all required fields."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        games = fetch_upcoming_games()

        assert len(games) > 0, "No games fetched"

        # Check first game has required fields
        game = games[0]
        assert "game_id" in game, "Game missing game_id"
        assert "home_team" in game, "Game missing home_team"
        assert "away_team" in game, "Game missing away_team"
        assert "start_time" in game, "Game missing start_time"
        assert "category" in game, "Game missing category"

    def test_games_have_multiple_categories(self):
        """Test that games include multiple sports categories."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        games = fetch_upcoming_games()

        categories = {g.get("category") for g in games}

        # Should have at least 2 different sports (some may be out of season)
        assert len(categories) >= 2, \
            f"Expected multiple sports categories, got: {categories}"

    def test_fetch_odds_for_games(self):
        """Test that odds are available for fetched games."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        games = fetch_upcoming_games()
        game_ids = [g["game_id"] for g in games[:10]]  # Test first 10 games

        odds_dict = fetch_odds_for_games(game_ids)

        # Each game should have odds
        for game_id in game_ids:
            assert game_id in odds_dict, f"No odds found for game {game_id}"
            odds = odds_dict[game_id]
            assert len(odds) > 0, f"Empty odds for game {game_id}"

    def test_odds_have_required_fields(self):
        """Test that odds have all required fields for ML processing."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        games = fetch_upcoming_games()
        game_id = games[0]["game_id"]

        odds_dict = fetch_odds_for_games([game_id])
        odds = odds_dict[game_id]

        assert len(odds) > 0, "No odds returned"

        # Check first odds entry has required fields
        odd = odds[0]
        assert "game_id" in odd, "Odds missing game_id"
        assert "market_type" in odd, "Odds missing market_type"
        assert "bookmaker" in odd, "Odds missing bookmaker"
        assert "price" in odd, "Odds missing price"
        assert "outcome_side" in odd, "Odds missing outcome_side"

    @pytest.mark.asyncio
    async def test_ml_pipeline_processes_games(self):
        """Test that the ML pipeline can process games from sports APIs."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        # Run the ML pipeline
        predictions = await fetch_all_predictions()

        # Should return at least 1 prediction
        assert len(predictions) >= 1, \
            f"ML pipeline returned no predictions, got {len(predictions)}"

        # Predictions should have required fields
        pred = predictions[0]
        assert "category" in pred, "Prediction missing category"
        assert "date" in pred, "Prediction missing date"
        assert "home_team" in pred, "Prediction missing home_team"
        assert "away_team" in pred, "Prediction missing away_team"
        assert "markets" in pred, "Prediction missing markets"

    def test_category_filter(self):
        """Test filtering games by category."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        # Fetch all games first to populate cache
        all_games = fetch_upcoming_games()

        # Get available categories
        categories = {g.get("category") for g in all_games}

        if len(categories) > 1:
            # Pick first category
            test_category = list(categories)[0]

            # Fetch filtered games
            filtered_games = fetch_upcoming_games(category=test_category)

            # All games should match the category
            for game in filtered_games:
                assert game.get("category", "").lower() == test_category.lower(), \
                    f"Found game with category {game.get('category')} when filtering for {test_category}"

    def test_cache_persistence(self):
        """Test that games are cached and reused."""
        import app.services.delta_lake_service as delta_service
        delta_service._cached_games = None
        delta_service._cached_odds = None

        # First fetch
        games1 = fetch_upcoming_games()

        # Second fetch should use cache
        games2 = fetch_upcoming_games()

        # Should return same games (from cache)
        assert len(games1) == len(games2), \
            "Cache not working - different number of games returned"

        # Check IDs match
        ids1 = {g["game_id"] for g in games1}
        ids2 = {g["game_id"] for g in games2}
        assert ids1 == ids2, "Cache not working - different game IDs returned"
