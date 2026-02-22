"""
Prediction service — bridges incoming API requests to the model
(local checkpoint or Databricks serving endpoint), querying Delta
Lake for historical context.

Exposes:
    predict(req)           — used by POST /predictions/
    _get_model_service()   — used by game_prediction_service
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Union

import numpy as np
import torch

from app.config import settings
from app.models.prediction import PredictionRequest
from app.models.market_prediction import MarketPrediction
from app.services.databricks_client import DatabricksServingClient
from app.services.local_model_service import LocalModelService, MARKET_TYPE_MAP

logger = logging.getLogger(__name__)


# ── Databricks remote model service ──────────────────────────────────


class DatabricksModelService:
    """Calls the Databricks serving endpoint with the same interface as LocalModelService."""

    def __init__(self, client: DatabricksServingClient) -> None:
        self._client = client
        # Verify connectivity with a lightweight probe (timeout after 10s)
        logger.info("DatabricksModelService: verifying endpoint connectivity")
        try:
            self._client.query([{"probe": True}])
            logger.info("DatabricksModelService: endpoint reachable")
        except Exception as exc:
            logger.warning("DatabricksModelService: probe failed (%s), continuing anyway", exc)

    def predict(
        self,
        features: torch.Tensor,
        mask: torch.Tensor,
        market_type: torch.Tensor,
    ) -> torch.Tensor:
        """Serialize tensors, call the remote endpoint, return a score tensor."""
        record = {
            "features": features.numpy().tolist(),
            "mask": mask.numpy().tolist(),
            "market_type": market_type.numpy().tolist(),
        }
        resp = self._client.query([record])
        predictions = resp.get("predictions", resp.get("outputs"))
        if predictions is None:
            raise RuntimeError(f"Unexpected serving response: {resp}")
        score = predictions[0] if isinstance(
            predictions[0], (int, float)) else predictions[0][0]
        return torch.tensor([score], dtype=torch.float64)

    def predict_from_request(self, req: PredictionRequest) -> dict:
        """Build a dataframe record from request fields and send to endpoint."""
        bookmakers = list(req.current_odds.keys())
        if len(bookmakers) < 2:
            return {"score": None, "error": "Need at least 2 bookmakers"}

        odds_a = np.array(req.current_odds[bookmakers[0]], dtype=np.float64)
        odds_b = np.array(req.current_odds[bookmakers[1]], dtype=np.float64)

        record = {
            "category": req.category,
            "date": req.date,
            "live": req.live,
            "home_team": req.home_team,
            "away_team": req.away_team,
            "market_type": (req.market_type or "MONEYLINE").upper(),
            "value": req.value,
            "odds_a": odds_a.tolist(),
            "odds_b": odds_b.tolist(),
        }
        resp = self._client.query([record])
        predictions = resp.get("predictions", resp.get("outputs"))
        if predictions is None:
            raise RuntimeError(f"Unexpected serving response: {resp}")

        score = predictions[0] if isinstance(
            predictions[0], (int, float)) else predictions[0][0]
        return {
            "score": float(score),
            "market_type": record["market_type"],
            "bookmakers_used": bookmakers[:2],
        }


# ── Model service singleton ──────────────────────────────────────────

_model_service: Union[LocalModelService, DatabricksModelService, None] = None


def _init_local() -> LocalModelService:
    """Create a LocalModelService from the configured checkpoint."""
    ckpt = Path(settings.model_checkpoint_path)
    if not ckpt.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found at {ckpt}. "
            "Run the training notebook and copy model.ckpt to "
            "Backend/models/model.ckpt"
        )
    return LocalModelService(str(ckpt))


def _init_remote() -> DatabricksModelService:
    """Create a DatabricksModelService from the configured credentials."""
    client = DatabricksServingClient(
        host=settings.databricks_host,
        client_id=settings.databricks_client_id,
        client_secret=settings.databricks_client_secret,
        endpoint_name=settings.databricks_serving_endpoint,
    )
    return DatabricksModelService(client)


def _get_model_service() -> Union[LocalModelService, DatabricksModelService]:
    """Lazy-initialise and return the singleton model service.

    Behaviour depends on ``settings.model_execution_mode``:
        * ``"local"``  — local checkpoint only
        * ``"remote"`` — Databricks endpoint only (fail loudly if unreachable)
        * ``"auto"``   — try remote first, fall back to local on any error
    """
    global _model_service
    if _model_service is not None:
        return _model_service

    mode = settings.model_execution_mode.lower()

    if mode == "local":
        logger.info("Model execution mode: local")
        _model_service = _init_local()
    elif mode == "remote":
        logger.info("Model execution mode: remote")
        _model_service = _init_remote()
    elif mode == "auto":
        logger.info("Model execution mode: auto (trying remote first)")
        try:
            _model_service = _init_remote()
            logger.info("Remote model service initialised successfully")
        except Exception:
            logger.warning(
                "Remote model service unavailable, falling back to local",
                exc_info=True,
            )
            _model_service = _init_local()
    else:
        raise ValueError(
            f"Invalid MODEL_EXECUTION_MODE={mode!r}. "
            "Must be 'local', 'remote', or 'auto'."
        )

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
