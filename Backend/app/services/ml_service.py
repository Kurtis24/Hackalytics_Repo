"""
ML Model Service — local inference via the trained checkpoint.

Pipeline:
  1. Fetch games from sports APIs (get_games_for_ml)
  2. For each game, fetch odds from Delta Lake / sample fallback
  3. Run the local TemporalArbitrageScorer model on each game × market pair
  4. Return PredictionInput-shaped dicts ready for the arbitrage pipeline
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

SAMPLE_PAYLOAD = {
    "category": "basketball",
    "date": "2023-01-10T20:00:00Z",
    "home_team": "Houston Rockets",
    "away_team": "New York Knicks",
    "markets": [
        {
            "market_type": "spread",
            "confidence": 0.65,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": 140,
            "price_2": 135,
            "open_price_1": 138,
            "open_price_2": 133,
            "prediction": "home_team wins by 6",
        },
        {
            "market_type": "points_total",
            "confidence": 0.61,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "FanDuel",
            "price_1": -110,
            "price_2": -105,
            "open_price_1": -110,
            "open_price_2": -105,
            "prediction": "home_team scores over 110",
        },
        {
            "market_type": "moneyline",
            "confidence": 0.72,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": -120,
            "price_2": 115,
            "open_price_1": -115,
            "open_price_2": 110,
            "prediction": "home_team wins",
        },
    ],
}


# ---------------------------------------------------------------------------
# Convert game_prediction_service output → PredictionInput dicts
# ---------------------------------------------------------------------------

def _game_prediction_to_payload(game_resp) -> dict[str, Any]:
    """Convert a GamePredictionResponse into a PredictionInput-compatible dict."""
    markets = []
    for m in game_resp.markets:
        markets.append({
            "market_type": m.market_type,
            "confidence": m.confidence,
            "bookmaker_1": m.bookmaker_1,
            "bookmaker_2": m.bookmaker_2,
            "price_1": m.price_1,
            "price_2": m.price_2,
            "prediction": m.prediction,
        })

    return {
        "category": game_resp.category,  # Use actual category from game response
        "date": game_resp.start_time,
        "home_team": game_resp.home_team,
        "away_team": game_resp.away_team,
        "markets": markets,
    }


def _fetch_all_predictions_sync() -> list[dict[str, Any]]:
    """Synchronous: run local model on all games from all sports, return PredictionInput dicts."""
    from app.services.game_prediction_service import get_all_game_predictions

    # Fetch all games (no category filter = all sports)
    response = get_all_game_predictions()

    payloads: list[dict[str, Any]] = []
    for game_resp in response.games:
        if game_resp.markets:
            payloads.append(_game_prediction_to_payload(game_resp))

    logger.info("Fetched predictions across all sports: %d total games", len(payloads))

    # Log category breakdown
    categories = {}
    for payload in payloads:
        cat = payload.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    logger.info("Category breakdown: %s", categories)

    return payloads


async def fetch_all_predictions() -> list[dict[str, Any]]:
    """
    Full ML pipeline:
      1. Fetch upcoming games + odds (Delta Lake / sample fallback)
      2. Run local model inference for each game × market type
      3. Return list of PredictionInput-compatible dicts

    Falls back to [SAMPLE_PAYLOAD] on error.
    """
    try:
        payloads = await asyncio.to_thread(_fetch_all_predictions_sync)
        if not payloads:
            logger.info("No game predictions produced — returning sample payload.")
            return [SAMPLE_PAYLOAD]
        logger.info("Local model produced predictions for %d games.", len(payloads))
        return payloads
    except Exception as e:
        logger.error("Local model pipeline failed (%s) — falling back to sample.", e)
        return [SAMPLE_PAYLOAD]


async def fetch_prediction() -> dict:
    """
    Backward-compatible: return a single prediction payload dict.
    Used by GET /arbitrage/opportunities and GET /arbitrage/analysis.
    """
    payloads = await fetch_all_predictions()
    return payloads[0] if payloads else SAMPLE_PAYLOAD
