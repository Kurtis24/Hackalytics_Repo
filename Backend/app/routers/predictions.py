from typing import Optional, Union
from fastapi import APIRouter, HTTPException, Query

from app.models.prediction import PredictionRequest
from app.models.market_prediction import (
    AllGamesPredictionResponse,
    GamePredictionResponse,
    MarketPrediction,
)
from app.services.prediction_service import predict
from app.services.game_prediction_service import (
    get_all_game_predictions,
    get_single_game_prediction,
)

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.post("/", response_model=Union[list[MarketPrediction], MarketPrediction])
async def create_prediction(
    req: PredictionRequest,
) -> Union[list[MarketPrediction], MarketPrediction]:
    """
    Accept game metadata + live odds, run model inference, and return predictions.

    When ``live=0`` and ``market_type`` is omitted, returns forecasts for
    all three market types (moneyline, spread, total). Otherwise returns
    a single MarketPrediction for the specified market.
    """
  
    try:
        return predict(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/games", response_model=AllGamesPredictionResponse)
async def get_all_predictions(
    category: Optional[str] = Query(
        None, description="Sport filter, e.g. 'basketball'"),
) -> AllGamesPredictionResponse:
    """
    Fetch all upcoming games from Delta Lake, run arb detection model
    on all 3 market types, and return predictions.
    """
    try:
        return get_all_game_predictions(category)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/games/{game_id}", response_model=GamePredictionResponse)
async def get_game_prediction(game_id: str) -> GamePredictionResponse:
    """
    Fetch a single game's odds from Delta Lake, run arb detection model
    on all 3 market types, and return predictions.
    """
    try:
        result = get_single_game_prediction(game_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if result is None:
        raise HTTPException(
            status_code=404, detail=f"No odds found for game '{game_id}'")
    return result
