"""
Delta Lake data-fetching service.

Pulls upcoming games and odds from Databricks Delta Lake tables via SQL.
Falls back to sample data when Databricks is unavailable or not configured.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


def _databricks_available() -> bool:
    """Return True only if Databricks credentials AND warehouse ID are configured."""
    return bool(
        settings.databricks_client_id
        and settings.databricks_client_secret
        and settings.databricks_warehouse_id
    )


def _get_client():
    """Lazy-init the Databricks client (only called when credentials exist)."""
    from app.services.databricks_client import DatabricksServingClient

    global _client
    if _client is None:
        _client = DatabricksServingClient(
            host=settings.databricks_host,
            client_id=settings.databricks_client_id,
            client_secret=settings.databricks_client_secret,
        )
    return _client


_client = None


# ── Sample / fallback data ───────────────────────────────────────────

SAMPLE_GAMES = [
    {
        "game_id": "sample-001",
        "home_team": "Los Angeles Lakers",
        "away_team": "Boston Celtics",
        "start_time": "2026-02-22T19:30:00Z",
        "category": "basketball",
    },
    {
        "game_id": "sample-002",
        "home_team": "Golden State Warriors",
        "away_team": "Miami Heat",
        "start_time": "2026-02-22T22:00:00Z",
        "category": "basketball",
    },
]

SAMPLE_ODDS = {
    "sample-001": [
        {"game_id": "sample-001", "market_type": "moneyline", "bookmaker": "DraftKings", "price": -150, "outcome_side": "home", "line_value": None},
        {"game_id": "sample-001", "market_type": "moneyline", "bookmaker": "FanDuel", "price": 130, "outcome_side": "away", "line_value": None},
        {"game_id": "sample-001", "market_type": "spread", "bookmaker": "DraftKings", "price": -110, "outcome_side": "home", "line_value": -3.5},
        {"game_id": "sample-001", "market_type": "spread", "bookmaker": "FanDuel", "price": -105, "outcome_side": "away", "line_value": 3.5},
        {"game_id": "sample-001", "market_type": "points_total", "bookmaker": "DraftKings", "price": -110, "outcome_side": "over", "line_value": 220.5},
        {"game_id": "sample-001", "market_type": "points_total", "bookmaker": "ESPNBet", "price": -108, "outcome_side": "under", "line_value": 220.5},
    ],
    "sample-002": [
        {"game_id": "sample-002", "market_type": "moneyline", "bookmaker": "FanDuel", "price": 120, "outcome_side": "home", "line_value": None},
        {"game_id": "sample-002", "market_type": "moneyline", "bookmaker": "ESPNBet", "price": -140, "outcome_side": "away", "line_value": None},
        {"game_id": "sample-002", "market_type": "spread", "bookmaker": "FanDuel", "price": -108, "outcome_side": "home", "line_value": 2.5},
        {"game_id": "sample-002", "market_type": "spread", "bookmaker": "ESPNBet", "price": -112, "outcome_side": "away", "line_value": -2.5},
        {"game_id": "sample-002", "market_type": "points_total", "bookmaker": "DraftKings", "price": -105, "outcome_side": "over", "line_value": 228.0},
        {"game_id": "sample-002", "market_type": "points_total", "bookmaker": "FanDuel", "price": -115, "outcome_side": "under", "line_value": 228.0},
    ],
}


# ── Public API ────────────────────────────────────────────────────────

def fetch_upcoming_games(category: Optional[str] = None) -> list[dict]:
    """Fetch upcoming games. Uses sample data when Databricks is not configured."""
    if _databricks_available():
        try:
            where = ""
            if category:
                where = f" WHERE category = '{category}'"
            sql = f"SELECT * FROM {settings.delta_games_table}{where} ORDER BY start_time"
            rows = _get_client().execute_sql(sql, settings.databricks_warehouse_id)
            if rows:
                return rows
        except Exception:
            logger.warning("Databricks unavailable — using sample game data")

    logger.info("Using sample game data (Databricks not configured)")
    games = SAMPLE_GAMES
    if category:
        games = [g for g in games if g.get("category", "").lower() == category.lower()]
    return games


def fetch_odds_for_game(game_id: str) -> list[dict]:
    """Fetch all odds rows for a single game."""
    if _databricks_available():
        try:
            sql = (
                f"SELECT * FROM {settings.delta_odds_table} "
                f"WHERE game_id = '{game_id}'"
            )
            rows = _get_client().execute_sql(sql, settings.databricks_warehouse_id)
            if rows:
                return rows
        except Exception:
            logger.warning("Databricks unavailable — using sample odds data")

    return SAMPLE_ODDS.get(game_id, [])


def fetch_odds_for_games(game_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch odds for multiple games, keyed by game_id."""
    if _databricks_available():
        try:
            ids_str = ", ".join(f"'{gid}'" for gid in game_ids)
            sql = (
                f"SELECT * FROM {settings.delta_odds_table} "
                f"WHERE game_id IN ({ids_str})"
            )
            rows = _get_client().execute_sql(sql, settings.databricks_warehouse_id)
            if rows:
                result: dict[str, list[dict]] = {}
                for row in rows:
                    result.setdefault(row["game_id"], []).append(row)
                return result
        except Exception:
            logger.warning("Databricks unavailable — using sample odds data")

    return {gid: SAMPLE_ODDS.get(gid, []) for gid in game_ids}
