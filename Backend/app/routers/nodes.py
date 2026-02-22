"""Nodes API: bulk accept and list nodes (outputs from Databricks ML)."""

from fastapi import APIRouter, HTTPException

from app.models.node import Node

router = APIRouter(prefix="/nodes", tags=["Nodes"])

# In-memory store for nodes (bulk from ML pipeline or frontend)
_nodes_store: list[dict] = []


@router.get("", response_model=list[Node])
def list_nodes() -> list[Node]:
    """Return all nodes currently in the store."""
    return [Node.model_validate(n) for n in _nodes_store]


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
