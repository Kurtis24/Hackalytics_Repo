"""
Prediction-market arbitrage router.

Surfaces live Polymarket + Kalshi markets and the arbitrage opportunities
between them. All upstream APIs are public — no keys required.
"""

from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app.models.prediction_market import (
    PredictionArbitrageResponse,
    PredictionMarketQuote,
)
from app.services import kalshi_service, polymarket_service
from app.services.prediction_arbitrage_service import (
    opportunity_to_node,
    scan_arbitrage,
)

router = APIRouter(prefix="/prediction-markets", tags=["Prediction Markets"])


@router.get("/polymarket", response_model=list[PredictionMarketQuote])
async def list_polymarket_markets(
    limit: int = Query(100, ge=1, le=1000),
) -> list[PredictionMarketQuote]:
    """List active Polymarket binary markets with normalised Yes/No prices."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            return await polymarket_service.fetch_markets(client, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Polymarket fetch failed: {exc}") from exc


@router.get("/kalshi", response_model=list[PredictionMarketQuote])
async def list_kalshi_markets(
    limit: int = Query(100, ge=1, le=1000),
) -> list[PredictionMarketQuote]:
    """List open Kalshi binary markets with normalised Yes/No prices."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            return await kalshi_service.fetch_markets(client, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kalshi fetch failed: {exc}") from exc


@router.get("/arbitrage", response_model=PredictionArbitrageResponse)
async def get_prediction_arbitrage(
    limit: int = Query(None, ge=1, le=2000, description="Markets to scan per venue"),
    min_margin: float = Query(
        None, ge=0.0, le=1.0,
        description="Minimum guaranteed margin (e.g. 0.01 = 1%)",
    ),
    match_threshold: float = Query(
        None, ge=0.0, le=1.0,
        description="Title-similarity threshold for cross-venue matches",
    ),
    include_cross: bool = Query(True, description="Include cross-venue (Poly↔Kalshi) arbs"),
    query: Optional[str] = Query(
        None, description="Only scan markets whose question contains this text (e.g. 'world cup')",
    ),
) -> PredictionArbitrageResponse:
    """Scan Polymarket + Kalshi and return guaranteed-profit opportunities."""
    try:
        return await scan_arbitrage(
            limit=limit,
            min_margin=min_margin,
            match_threshold=match_threshold,
            include_cross=include_cross,
            query=query,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Arbitrage scan failed: {exc}") from exc


@router.get("/arbitrage/nodes", response_model=list[dict])
async def get_prediction_arbitrage_nodes(
    limit: int = Query(None, ge=1, le=2000),
    min_margin: float = Query(None, ge=0.0, le=1.0),
    include_cross: bool = Query(True),
    query: Optional[str] = Query(None),
) -> list[dict]:
    """Same scan as /arbitrage, but shaped as frontend graph nodes."""
    try:
        result = await scan_arbitrage(
            limit=limit, min_margin=min_margin, include_cross=include_cross, query=query,
        )
        return [opportunity_to_node(o) for o in result.opportunities]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Arbitrage scan failed: {exc}") from exc
