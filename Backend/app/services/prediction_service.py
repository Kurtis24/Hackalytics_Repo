"""
Prediction service — bridges incoming API requests to the local
PyTorch model, using locally generated odds for context.

Exposes:
    predict(req)           — used by POST /predictions/
    _get_model_service()   — used by game_prediction_service
"""

from __future__ import annotations
from app.services.local_model_service import LocalModelService, MARKET_TYPE_MAP
from app.services.data_service import fetch_odds_for_games, fetch_upcoming_games

import logging
from pathlib import Path

import numpy as np

from app.config import settings
from app.models.prediction import PredictionRequest
from app.models.market_prediction import MarketPrediction

logger = logging.getLogger(__name__)


# ── Model service singleton ──────────────────────────────────────────

_model_service: LocalModelService | None = None


def _init_local() -> LocalModelService:
    """Create a LocalModelService from the configured checkpoint."""
    ckpt = Path(settings.model_checkpoint_path)
    if not ckpt.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found at {ckpt}. "
            "Train the model with the notebook in Backend/models/ or set "
            "MODEL_CHECKPOINT_PATH to an existing checkpoint."
        )
    return LocalModelService(str(ckpt))


def _get_model_service() -> LocalModelService:
    """Lazy-initialise and return the singleton local model service."""
    global _model_service
    if _model_service is None:
        logger.info("Initialising local model service")
        _model_service = _init_local()
    return _model_service


def _decimal_to_american(decimal_odds: float) -> int:
    """Convert decimal odds to American odds."""
    if decimal_odds >= 2.0:
        return round((decimal_odds - 1) * 100)
    return round(-100 / (decimal_odds - 1))


def _derive_prediction(market_type: str, confidence: float, req: PredictionRequest) -> str:
    """Build human-readable prediction text from market type and request."""
    mt = market_type.lower()
    if mt == "points_spread":
        side = "home_team" if confidence >= 0.5 else "away_team"
        sign = "+" if req.value > 0 else ""
        return f"{side} {sign}{req.value}"
    if mt == "points_total":
        direction = "over" if confidence >= 0.5 else "under"
        return f"{direction} {req.value}"
    # moneyline
    side = "home_team" if confidence >= 0.5 else "away_team"
    return f"{side} wins"


def _predict_single(req: PredictionRequest, market_type_override: str | None = None) -> MarketPrediction:
    """Run inference for a single market type and return a MarketPrediction."""
    svc = _get_model_service()

    # If overriding market type, create a copy with the desired type
    if market_type_override:
        req = req.model_copy(update={"market_type": market_type_override})

    result = svc.predict_from_request(req)

    bookmakers = result.get(
        "bookmakers_used", list(req.current_odds.keys())[:2])
    confidence = result.get("score", 0.0) or 0.0
    market_type = result.get(
        "market_type", (req.market_type or "MONEYLINE").upper())

    # Convert mean decimal odds per bookmaker to American prices
    odds_a = np.array(req.current_odds[bookmakers[0]], dtype=np.float64)
    odds_b = np.array(req.current_odds[bookmakers[1]], dtype=np.float64)
    price_1 = _decimal_to_american(float(odds_a.mean()))
    price_2 = _decimal_to_american(float(odds_b.mean()))

    prediction = _derive_prediction(market_type, confidence, req)

    logger.info("Obtained prediction: %s", prediction)
    return MarketPrediction(
        market_type=market_type,
        confidence=round(confidence, 4),
        bookmaker_1=bookmakers[0],
        bookmaker_2=bookmakers[1],
        price_1=price_1,
        price_2=price_2,
        prediction=prediction,
    )


def predict(req: PredictionRequest) -> list[MarketPrediction] | MarketPrediction:
    """Accept a PredictionRequest, run model inference, return predictions.

    When live=0 and no market_type is specified, returns a list of
    MarketPrediction for all three market types. Otherwise returns a
    single MarketPrediction.
    """
    if len(req.current_odds) < 2:
        raise ValueError(
            "current_odds must contain at least 2 bookmakers"
        )

    # Pre-game with no specific market → return all 3
    if req.live == 0 and not req.market_type:
        return [
            _predict_single(req, mt)
            for mt in MARKET_TYPE_MAP
        ]

    return _predict_single(req)
