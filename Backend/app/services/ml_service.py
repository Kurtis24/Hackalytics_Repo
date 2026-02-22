"""
ML Model Service

- POSTs to the configured ML_MODEL_URL to fetch a prediction payload (existing).
- Uses the existing Databricks client to send games (live + not live) to the
  discover_arbitrage serving endpoint and return node-shaped outputs. No ML
  logic here — all model logic lives in Databricks.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from app.config import settings
from app.models.game import Game
from app.services.games_service import get_games_for_ml
from app.services.databricks_client import DatabricksServingClient

logger = logging.getLogger(__name__)

SAMPLE_PAYLOAD = {
    "category": "basketball",
    "date": "2023-01-10T20:00:00Z",
    "home_team": "Houston Rockets",
    "away_team": "New York Knicks",
    "markets": [
        {
            # True arb: +140 / +135 — line barely moved from open (+138 / +133)
            # arb_margin ≈ 15.7% (exceptional odds; real markets typically 0.5-3%)
            "market_type": "spread",
            "confidence": 0.65,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": 140,
            "price_2": 135,
            "open_price_1": 138,
            "open_price_2": 133,
            "prediction": "home_team wins by 6",
        },
        {
            # No arb: both sides -110 / -105 — vig still present
            "market_type": "points_total",
            "confidence": 0.61,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "FanDuel",
            "price_1": -110,
            "price_2": -105,
            "open_price_1": -110,
            "open_price_2": -105,
            "prediction": "home_team scores over 110",
        },
        {
            # No arb: -120 / +115 — implied sum > 1.0
            "market_type": "moneyline",
            "confidence": 0.72,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": -120,
            "price_2": 115,
            "open_price_1": -115,
            "open_price_2": 110,
            "prediction": "home_team wins",
        },
    ],
}


async def fetch_prediction() -> dict:
    """
    POST to ML_MODEL_URL and return the prediction payload dict.
    Falls back to SAMPLE_PAYLOAD if ML_MODEL_URL is not configured or unreachable.
    """
    url = settings.ml_model_url.strip()

    if not url:
        logger.info("ML_MODEL_URL not set — returning sample payload.")
        return SAMPLE_PAYLOAD

    logger.info("Fetching prediction from ML model: %s", url)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={})
            resp.raise_for_status()
            data = resp.json()
            logger.info("Received payload (%d markets).", len(data.get("markets", [])))
            return data
    except httpx.HTTPStatusError as e:
        logger.error("HTTP %s from ML model — falling back to sample.", e.response.status_code)
        return SAMPLE_PAYLOAD
    except Exception as e:
        logger.error("Could not reach ML model (%s) — falling back to sample.", e)
        return SAMPLE_PAYLOAD


# ---------------------------------------------------------------------------
# Databricks path: games -> existing Databricks client -> nodes (response parsing only)
# ---------------------------------------------------------------------------

def _games_to_records(games: list[Game]) -> list[dict[str, Any]]:
    """Convert games to dataframe_records for the existing Databricks client."""
    return [
        {
            "category": g.category,
            "home_team": g.home_team,
            "away_team": g.away_team,
            "start_time": g.start_time,
            "live": g.live,
        }
        for g in games
    ]


def _parse_databricks_response(response: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse the raw Databricks serving response into node-shaped dicts (no ML logic)."""
    predictions = response.get("predictions") or response.get("predictions_array") or response.get("result")
    if predictions is None:
        if "columns" in response and "data" in response:
            cols = response["columns"]
            rows = response.get("data", [])
            return [_row_to_node(dict(zip(cols, row))) for row in rows]
        return []
    if not isinstance(predictions, list):
        return []
    return [_row_to_node(p if isinstance(p, dict) else {}) for p in predictions]


def _first_node_from_response(response: dict[str, Any]) -> dict[str, Any] | None:
    """Extract a single node from a one-game ML response (for one-at-a-time calls)."""
    nodes = _parse_databricks_response(response)
    return nodes[0] if nodes else None


def _row_to_node(row: dict[str, Any]) -> dict[str, Any]:
    """Map one Databricks output row to frontend Node shape (field mapping only)."""
    date_val = row.get("date") or row.get("Date") or row.get("start_time") or ""
    if hasattr(date_val, "isoformat"):
        date_val = date_val.isoformat()
    return {
        "category": row.get("category", ""),
        "home_team": row.get("home_team", ""),
        "away_team": row.get("away_team", ""),
        "profit_score": float(row.get("profit_score", 0) or 0),
        "risk_score": float(row.get("risk_score", 0) or 0),
        "confidence": float(row.get("confidence", 0) or 0),
        "volume": int(row.get("volume", row.get("optimal_volume", 0)) or 0),
        "date": date_val,
        "market_type": row.get("market_type", ""),
        "sportsbooks": row.get("sportsbooks", []),
    }


_ENDPOINT_STOPPED_PHRASES = (
    "endpoint is stopped",
    "endpoint is not ready",
    "please retry after starting",
)


def _run_ml_queries_sync(
    client: DatabricksServingClient,
    records: list[dict[str, Any]],
    delay_seconds: float,
) -> list[dict[str, Any]]:
    """
    Synchronous loop: one Databricks query per record, strictly sequential.
    Used inside a thread so the async pipeline can explicitly await completion.
    """
    nodes: list[dict[str, Any]] = []
    for i, record in enumerate(records):
        if delay_seconds and i > 0:
            time.sleep(delay_seconds)
        try:
            response = client.query([record])
            node = _first_node_from_response(response)
            if node:
                nodes.append(node)
        except Exception as e:
            err_str = str(e).lower()
            if any(phrase in err_str for phrase in _ENDPOINT_STOPPED_PHRASES):
                msg = (
                    "Databricks model serving endpoint is stopped. "
                    "Start the endpoint in the Databricks workspace (Serving → your endpoint → Start), then retry."
                )
                logger.error("%s (failed on request %d/%d)", msg, i + 1, len(records))
                raise RuntimeError(msg) from e
            logger.warning("ML request %d/%d failed (%s), skipping game.", i + 1, len(records), e)
    return nodes


async def fetch_nodes_via_databricks() -> list[dict[str, Any]]:
    """
    1) Request up to ml_target_nodes (default 150) games from sports, evenly distributed.
    2) Run ML queries strictly sequentially in a thread and wait for completion.
    3) Return all nodes. Pipeline is dependent: we do not return until the ML phase is done.
    """
    if not settings.databricks_client_id or not settings.databricks_client_secret:
        logger.warning("Databricks credentials not set — returning no nodes.")
        return []

    games = await get_games_for_ml(target=settings.ml_target_nodes)
    if not games:
        logger.info("No games to send to Databricks — returning empty list.")
        return []

    client = DatabricksServingClient(
        host=settings.databricks_host,
        client_id=settings.databricks_client_id,
        client_secret=settings.databricks_client_secret,
        endpoint_name=settings.databricks_serving_endpoint,
    )
    records = _games_to_records(games)
    delay = max(0.0, settings.ml_request_delay_seconds)

    # Force wait: run blocking ML loop in a thread and await it so the pipeline is dependent
    nodes = await asyncio.to_thread(
        _run_ml_queries_sync,
        client,
        records,
        delay,
    )

    logger.info("Databricks returned %d nodes from %d games (one ML call per game).", len(nodes), len(games))
    return nodes
