"""
ML router: run games -> existing Databricks client (via ml_service) -> nodes.
Uses only existing ml_service and databricks client; no custom ML logic.
"""

from fastapi import APIRouter, HTTPException

from app.services.ml_service import fetch_nodes_via_databricks
from app.routers.nodes import _nodes_store

router = APIRouter(prefix="/ml", tags=["ML Pipeline"])


@router.post("/run", response_model=list)
async def run_pipeline(store: bool = True) -> list:
    """
    Use ml_service to send games (live + not live) through the existing
    Databricks client; return node-shaped outputs. If store=True, append to nodes store.
    """
    try:
        nodes = await fetch_nodes_via_databricks()
        if store and nodes:
            _nodes_store.extend(nodes)
        return nodes
    except RuntimeError as exc:
        if "endpoint is stopped" in str(exc).lower() or "start the endpoint" in str(exc).lower():
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
