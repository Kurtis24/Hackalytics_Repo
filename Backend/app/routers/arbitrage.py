from fastapi import APIRouter, HTTPException

from app.models.arbitrage import ArbitrageOpportunity, PortfolioAnalysis, PredictionInput
from app.services.ml_service import fetch_prediction
from app.services.arbitrage_service import process_prediction
from app.services.analysis_service import analyze

router = APIRouter(prefix="/arbitrage", tags=["Arbitrage"])


@router.get("/opportunities", response_model=list[ArbitrageOpportunity])
async def get_opportunities() -> list[ArbitrageOpportunity]:
    """
    Fetches the latest prediction from the ML model internally,
    runs it through the arbitrage pipeline, and returns all
    qualifying opportunities scored and filtered.
    """
    try:
        raw = await fetch_prediction()
        payload = PredictionInput(**raw)
        return process_prediction(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/analysis", response_model=PortfolioAnalysis)
async def get_analysis() -> PortfolioAnalysis:
    """
    Fetches the latest prediction from the ML model internally,
    runs it through the arbitrage pipeline, and returns a full
    portfolio analysis (risk distribution, capital totals, rankings).
    """
    try:
        raw = await fetch_prediction()
        payload = PredictionInput(**raw)
        opportunities = process_prediction(payload)
        return analyze(opportunities)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
