"""
Delta Lake data-fetching service.

Pulls upcoming games and odds from Databricks Delta Lake tables via SQL.
Falls back to fetching from sports APIs when Databricks is unavailable or not configured.
"""

from __future__ import annotations

import asyncio
import logging
import random
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

# Cache for games fetched from sports APIs
_cached_games: list[dict] | None = None
_cached_odds: dict[str, list[dict]] | None = None


def _generate_synthetic_game(category: str, index: int) -> dict:
    """Generate a synthetic game for visualization when real games aren't available."""
    random.seed(hash(f"{category}-{index}"))

    teams_by_sport = {
        "basketball": [
            ("Los Angeles Lakers", "Boston Celtics"),
            ("Golden State Warriors", "Miami Heat"),
            ("Chicago Bulls", "New York Knicks"),
            ("Dallas Mavericks", "Phoenix Suns"),
        ],
        "baseball": [
            ("New York Yankees", "Boston Red Sox"),
            ("Los Angeles Dodgers", "San Francisco Giants"),
            ("Chicago Cubs", "St. Louis Cardinals"),
            ("Houston Astros", "Texas Rangers"),
        ],
        "hockey": [
            ("Toronto Maple Leafs", "Montreal Canadiens"),
            ("New York Rangers", "Boston Bruins"),
            ("Chicago Blackhawks", "Detroit Red Wings"),
            ("Edmonton Oilers", "Calgary Flames"),
        ],
        "football": [
            ("Kansas City Chiefs", "Buffalo Bills"),
            ("San Francisco 49ers", "Dallas Cowboys"),
            ("Green Bay Packers", "Chicago Bears"),
            ("New England Patriots", "New York Jets"),
        ],
    }

    matchups = teams_by_sport.get(category, teams_by_sport["basketball"])
    home, away = matchups[index % len(matchups)]

    from datetime import datetime, timedelta, timezone
    start_time = (datetime.now(timezone.utc) + timedelta(days=random.randint(1, 30))).isoformat()

    return {
        "game_id": f"synthetic-{category}-{index}",
        "home_team": home,
        "away_team": away,
        "start_time": start_time,
        "category": category,
    }


def _generate_varied_odds(game_id: str, seed_offset: int = 0) -> list[dict]:
    """Generate varied odds for a game to ensure 3D visualization spread.

    Uses game_id hash + offset as seed for reproducibility.
    Generates odds that create arbitrage opportunities for visualization.
    """
    # Use game_id hash for consistent but varied odds per game
    random.seed(hash(game_id) + seed_offset)

    # Generate odds that create arbitrage (implied prob sum < 1.0)
    # To create arb: (1/dec1) + (1/dec2) < 1.0
    # Generate varied arbitrage margins from 0.5% to 8%
    arb_margin_pct = random.uniform(0.005, 0.08)  # 0.5% to 8%
    target_sum = 1.0 - arb_margin_pct

    # Split the implied prob between two sides
    side1_prob = random.uniform(0.35, 0.65)
    side2_prob = target_sum - side1_prob

    # Convert to decimal odds then to American
    dec1 = 1 / side1_prob
    dec2 = 1 / side2_prob

    def decimal_to_american(dec):
        if dec >= 2.0:
            return int((dec - 1) * 100)
        else:
            return int(-100 / (dec - 1))

    price1 = decimal_to_american(dec1)
    price2 = decimal_to_american(dec2)

    # Generate spread values
    spread_value = round(random.uniform(1.5, 12.5) * 2) / 2

    # Generate spread arb
    spread_arb = random.uniform(0.005, 0.08)
    spread_sum = 1.0 - spread_arb
    spread_prob1 = random.uniform(0.40, 0.60)
    spread_prob2 = spread_sum - spread_prob1
    spread_price1 = decimal_to_american(1 / spread_prob1)
    spread_price2 = decimal_to_american(1 / spread_prob2)

    # Generate total values
    total_line = round(random.uniform(180.5, 250.5) * 2) / 2
    total_arb = random.uniform(0.005, 0.08)
    total_sum = 1.0 - total_arb
    total_prob1 = random.uniform(0.40, 0.60)
    total_prob2 = total_sum - total_prob1
    over_price = decimal_to_american(1 / total_prob1)
    under_price = decimal_to_american(1 / total_prob2)

    return [
        # Moneyline
        {"game_id": game_id, "market_type": "moneyline", "bookmaker": "DraftKings", "price": price1, "outcome_side": "home", "line_value": None},
        {"game_id": game_id, "market_type": "moneyline", "bookmaker": "FanDuel", "price": price2, "outcome_side": "away", "line_value": None},
        # Spread
        {"game_id": game_id, "market_type": "spread", "bookmaker": "DraftKings", "price": spread_price1, "outcome_side": "home", "line_value": -spread_value},
        {"game_id": game_id, "market_type": "spread", "bookmaker": "FanDuel", "price": spread_price2, "outcome_side": "away", "line_value": spread_value},
        # Total
        {"game_id": game_id, "market_type": "points_total", "bookmaker": "DraftKings", "price": over_price, "outcome_side": "over", "line_value": total_line},
        {"game_id": game_id, "market_type": "points_total", "bookmaker": "ESPNBet", "price": under_price, "outcome_side": "under", "line_value": total_line},
    ]


# ── Public API ────────────────────────────────────────────────────────

def fetch_upcoming_games(category: Optional[str] = None, force_refresh: bool = False) -> list[dict]:
    """Fetch upcoming games from Databricks or sports APIs."""
    global _cached_games, _cached_odds

    # Allow forcing a cache refresh
    if force_refresh:
        _cached_games = None
        _cached_odds = None
        logger.info("Cache cleared - forcing fresh fetch")

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
            logger.warning("Databricks unavailable — fetching from sports APIs")

    # Fetch from sports APIs when Databricks is not configured
    if _cached_games is None:
        target_games = 150  # Target number of games to fetch
        logger.info("Fetching %d upcoming games from sports APIs", target_games)
        try:
            from app.services.games_service import get_all_upcoming_games

            # Fetch upcoming games from sports APIs
            upcoming_games = asyncio.run(get_all_upcoming_games())

            # Take up to target_games
            games_to_cache = upcoming_games[:target_games]

            _cached_games = []
            _cached_odds = {}

            # Organize real games by category
            games_by_category = {"basketball": [], "baseball": [], "hockey": [], "football": []}
            for game in games_to_cache:
                cat = game.category.lower()
                if cat in games_by_category:
                    games_by_category[cat].append(game)

            # Just use all available games, distributed evenly
            # Take up to target_games total, prioritizing even distribution
            game_index = 0
            games_per_sport = target_games // 4  # Try to get 37-38 per sport

            # First pass: try to get games_per_sport from each sport
            for sport_category in ["basketball", "baseball", "hockey", "football"]:
                available = games_by_category[sport_category]
                to_add = min(len(available), games_per_sport)

                for game in available[:to_add]:
                    game_id = f"{game.category}-{game.home_team.replace(' ', '-')}-{game.away_team.replace(' ', '-')}-{game_index}"
                    game_dict = {
                        "game_id": game_id,
                        "home_team": game.home_team,
                        "away_team": game.away_team,
                        "start_time": game.start_time,
                        "category": game.category,
                    }
                    _cached_games.append(game_dict)
                    _cached_odds[game_id] = _generate_varied_odds(game_id, seed_offset=game_index)
                    game_index += 1

            # Second pass: if we're under target, fill from sports with extra games
            remaining_needed = target_games - len(_cached_games)
            if remaining_needed > 0:
                logger.info("Need %d more games to reach target - filling from available sports", remaining_needed)
                for sport_category in ["basketball", "hockey", "baseball", "football"]:
                    if remaining_needed <= 0:
                        break

                    available = games_by_category[sport_category]
                    already_used = min(len(available), games_per_sport)
                    extra_available = available[already_used:]

                    for game in extra_available[:remaining_needed]:
                        game_id = f"{game.category}-{game.home_team.replace(' ', '-')}-{game.away_team.replace(' ', '-')}-{game_index}"
                        game_dict = {
                            "game_id": game_id,
                            "home_team": game.home_team,
                            "away_team": game.away_team,
                            "start_time": game.start_time,
                            "category": game.category,
                        }
                        _cached_games.append(game_dict)
                        _cached_odds[game_id] = _generate_varied_odds(game_id, seed_offset=game_index)
                        game_index += 1
                        remaining_needed -= 1

            logger.info("Cached %d total games from available sports", len(_cached_games))

            # Log breakdown by sport
            category_counts = {}
            for game in _cached_games:
                cat = game.get("category", "unknown")
                category_counts[cat] = category_counts.get(cat, 0) + 1
            logger.info("Games by sport: %s", category_counts)

            # If no games were fetched, fall back to sample data
            if len(_cached_games) == 0:
                logger.warning("No games fetched from sports APIs - using sample data")
                _cached_games = SAMPLE_GAMES
                _cached_odds = SAMPLE_ODDS
        except Exception as e:
            logger.error("Failed to fetch from sports APIs (%s) — using sample data", e, exc_info=True)
            _cached_games = SAMPLE_GAMES
            _cached_odds = SAMPLE_ODDS

    # Filter by category if requested
    games = _cached_games if _cached_games is not None else []
    if category:
        games = [g for g in games if g.get("category", "").lower() == category.lower()]

    # Final fallback: if we somehow have no games, use sample data
    if len(games) == 0 and category is None:
        logger.warning("No games available - using sample data as final fallback")
        return SAMPLE_GAMES

    return games


def fetch_odds_for_game(game_id: str) -> list[dict]:
    """Fetch all odds rows for a single game."""
    global _cached_odds

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
            logger.warning("Databricks unavailable — using cached odds")

    # Use cached odds if available
    if _cached_odds is not None:
        return _cached_odds.get(game_id, [])
    return SAMPLE_ODDS.get(game_id, [])


def fetch_odds_for_games(game_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch odds for multiple games, keyed by game_id."""
    global _cached_odds

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
            logger.warning("Databricks unavailable — using cached odds")

    # Use cached odds if available
    if _cached_odds is not None:
        return {gid: _cached_odds.get(gid, []) for gid in game_ids}
    return {gid: SAMPLE_ODDS.get(gid, []) for gid in game_ids}
