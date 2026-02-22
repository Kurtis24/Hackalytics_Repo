"""
ML router: legacy endpoint. The primary pipeline is now POST /arbitrage/execute.
This endpoint is kept for backward compatibility (Load from ML button).
"""

from fastapi import APIRouter, HTTPException

from app.services.ml_service import fetch_all_predictions
from app.routers.nodes import _nodes_store
import pdb

router = APIRouter(prefix="/ml", tags=["ML Pipeline"])


@router.post("/run", response_model=list)
async def run_pipeline(store: bool = True) -> list:
    """
    Run the local ML model on all games and return prediction payloads.
    If store=True, append to nodes store for later retrieval via GET /nodes.
    """
    try:

        payloads = await fetch_all_predictions()
        if store:
            for p in payloads:
                _nodes_store.append(p)
        return payloads
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
