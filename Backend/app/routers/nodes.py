"""Nodes API: bulk accept and list nodes (outputs from Databricks ML)."""

from fastapi import APIRouter, HTTPException

from app.models.node import Node
from app.services.supabase_service import supabase_service

router = APIRouter(prefix="/nodes", tags=["Nodes"])

# In-memory store for nodes (bulk from ML pipeline or frontend)
_nodes_store: list[dict] = []


@router.get("", response_model=list[Node])
def list_nodes() -> list[Node]:
    """Return all nodes from Supabase arbitrage_executions table."""
    db_records = supabase_service.get_arbitrage_executions()

    # Transform Supabase records to Node format
    nodes = []
    for record in db_records:
        # Build sportsbooks array from the flat structure
        sportsbooks = []
        if record.get("bookmaker_1") and record.get("odds_1"):
            sportsbooks.append({
                "name": record["bookmaker_1"],
                "odds": record["odds_1"]
            })
        if record.get("bookmaker_2") and record.get("odds_2"):
            sportsbooks.append({
                "name": record["bookmaker_2"],
                "odds": record["odds_2"]
            })

        node_data = {
            "category": record.get("category", ""),
            "home_team": record.get("home_team", ""),
            "away_team": record.get("away_team", ""),
            "profit_score": record.get("profit_score", 0.0),
            "risk_score": record.get("risk_score", 0.0),
            "confidence": record.get("confidence", 0.0),
            "volume": record.get("volume", 0),
            "date": record.get("game_date", ""),
            "market_type": record.get("market_type", ""),
            "sportsbooks": sportsbooks
        }
        nodes.append(Node.model_validate(node_data))

    return nodes


@router.post("/bulk", response_model=dict)
def bulk_create_nodes(nodes: list[Node]) -> dict:
    """
    Accept bulk nodes at a time (e.g. outputs from Databricks ML API).
    Appends to the in-memory store and returns count accepted.
    """
    for node in nodes:
        _nodes_store.append(node.model_dump(mode="json"))
    return {"accepted": len(nodes), "total": len(_nodes_store)}


@router.delete("", response_model=dict)
def clear_nodes() -> dict:
    """Clear all nodes from the store (e.g. for testing)."""
    count = len(_nodes_store)
    _nodes_store.clear()
    return {"cleared": count}
