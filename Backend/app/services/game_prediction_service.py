"""
Game prediction orchestration service.

Pulls games + odds from Delta Lake, groups by market type, picks the
best bookmaker pair, runs model inference, and assembles the response.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Optional

import numpy as np
import torch

from app.models.market_prediction import (
    AllGamesPredictionResponse,
    GamePredictionResponse,
    MarketPrediction,
)
from app.services.delta_lake_service import (
    fetch_odds_for_game,
    fetch_odds_for_games,
    fetch_upcoming_games,
)
from app.services.local_model_service import MARKET_TYPE_MAP, engineer_features
from app.services.prediction_service import _get_model_service

logger = logging.getLogger(__name__)

# All three market types we score
MARKET_TYPES = ["moneyline", "spread", "points_total"]

# Map market_type strings to the MARKET_TYPE_MAP keys used by the model
_MODEL_KEY = {
    "moneyline": "MONEYLINE",
    "spread": "POINTS_SPREAD",
    "points_total": "POINTS_TOTAL",
}


def _american_to_decimal(american: int) -> float:
    """Convert American odds to decimal odds."""
    if american >= 0:
        return (american / 100) + 1
    return (100 / abs(american)) + 1


def _pick_best_pair(odds_rows: list[dict]) -> tuple[dict, dict] | None:
    """Pick the two odds rows with the lowest combined implied probability.

    This maximises arb potential. Returns None if fewer than 2 rows.
    """
    if len(odds_rows) < 2:
        return None

    best_pair = None
    best_combined = float("inf")

    for i in range(len(odds_rows)):
        for j in range(i + 1, len(odds_rows)):
            dec_i = _american_to_decimal(int(odds_rows[i]["price"]))
            dec_j = _american_to_decimal(int(odds_rows[j]["price"]))
            combined = (1 / dec_i) + (1 / dec_j)
            if combined < best_combined:
                best_combined = combined
                best_pair = (odds_rows[i], odds_rows[j])

    return best_pair


def _derive_prediction(market_type: str, confidence: float, row_1: dict, row_2: dict) -> str:
    """Build human-readable prediction text from market type and odds context."""
    if market_type == "spread":
        side = row_1.get("outcome_side", "home")
        value = row_1.get("line_value")
        if value is not None:
            sign = "+" if float(value) > 0 else ""
            return f"{side} {sign}{float(value)}"
        return f"{side} spread"

    if market_type == "points_total":
        value = row_1.get("line_value") or row_2.get("line_value")
        direction = "over" if confidence >= 0.5 else "under"
        if value is not None:
            return f"{direction} {float(value)}"
        return direction

    # moneyline
    side = row_1.get("outcome_side", "home")
    return f"{side} win"


def _score_market(
    market_type: str,
    row_1: dict,
    row_2: dict,
) -> MarketPrediction:
    """Run model inference on a single market pair and return a MarketPrediction."""
    dec_1 = _american_to_decimal(int(row_1["price"]))
    dec_2 = _american_to_decimal(int(row_2["price"]))

    features = engineer_features(
        np.array([dec_1], dtype=np.float64),
        np.array([dec_2], dtype=np.float64),
    )

    features_t = torch.tensor(features, dtype=torch.float64).unsqueeze(0)
    mask_t = torch.ones(1, 1, dtype=torch.bool)

    model_key = _MODEL_KEY.get(market_type, "MONEYLINE")
    market_idx = MARKET_TYPE_MAP.get(model_key, 0)
    market_t = torch.tensor([market_idx], dtype=torch.long)

    svc = _get_model_service()
    score = svc.predict(features_t, mask_t, market_t)
    confidence = float(score.item())

    prediction_text = _derive_prediction(market_type, confidence, row_1, row_2)

    return MarketPrediction(
        market_type=market_type,
        confidence=confidence,
        bookmaker_1=row_1.get("bookmaker", "unknown"),
        bookmaker_2=row_2.get("bookmaker", "unknown"),
        price_1=int(row_1["price"]),
        price_2=int(row_2["price"]),
        prediction=prediction_text,
    )


def _build_game_prediction(game: dict, odds_rows: list[dict]) -> GamePredictionResponse:
    """Build a full GamePredictionResponse for one game."""
    # Group odds by market_type
    by_market: dict[str, list[dict]] = defaultdict(list)
    for row in odds_rows:
        mt = row.get("market_type", "").lower()
        if mt in MARKET_TYPES:
            by_market[mt].append(row)

    markets: list[MarketPrediction] = []
    for mt in MARKET_TYPES:
        rows = by_market.get(mt, [])
        pair = _pick_best_pair(rows)
        if pair is None:
            continue
        try:
            mp = _score_market(mt, pair[0], pair[1])
            markets.append(mp)
        except Exception:
            logger.warning("Failed to score %s for game %s", mt, game.get("game_id"), exc_info=True)

    return GamePredictionResponse(
        game_id=game.get("game_id", "unknown"),
        category=game.get("category", "basketball"),
        home_team=game.get("home_team", "unknown"),
        away_team=game.get("away_team", "unknown"),
        start_time=game.get("start_time", ""),
        markets=markets,
    )


# ── Public API ────────────────────────────────────────────────────────

def get_all_game_predictions(category: Optional[str] = None) -> AllGamesPredictionResponse:
    """Fetch all upcoming games, run predictions, return response."""
    games = fetch_upcoming_games(category)
    game_ids = [g["game_id"] for g in games]
    all_odds = fetch_odds_for_games(game_ids)

    results = []
    for game in games:
        gid = game["game_id"]
        odds = all_odds.get(gid, [])
        results.append(_build_game_prediction(game, odds))

    return AllGamesPredictionResponse(games=results)


def get_single_game_prediction(game_id: str) -> GamePredictionResponse | None:
    """Fetch a single game's data, run predictions, return response."""
    games = fetch_upcoming_games()
    game = next((g for g in games if g["game_id"] == game_id), None)

    if game is None:
        # Build a minimal game dict so we can still return odds-based predictions
        game = {
            "game_id": game_id,
            "home_team": "unknown",
            "away_team": "unknown",
            "start_time": "",
        }

    odds = fetch_odds_for_game(game_id)
    if not odds:
        return None

    return _build_game_prediction(game, odds)
