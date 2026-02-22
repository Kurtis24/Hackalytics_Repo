"""
NHL upcoming REGULAR SEASON games via the official NHL Stats API v1 (api-web.nhle.com).

The schedule endpoint returns one week at a time. This service paginates week-by-week
using the `nextStartDate` field in each response until `settings.days_ahead` days are covered.

Filters applied:
  - gameType == 2  → regular season only (1=pre, 2=regular, 3=playoffs)
  - gameState == "FUT" → not yet started
"""

import logging
from datetime import datetime, timezone, timedelta

import httpx

from app.config import settings
from app.models.game import Game

logger = logging.getLogger(__name__)

_BASE = "https://api-web.nhle.com/v1/schedule"
_CATEGORY = "hockey"
_REGULAR_SEASON_TYPE = 2

_TEAM_MAP: dict[str, str] = {
    "ANA": "Anaheim Ducks",
    "ARI": "Arizona Coyotes",
    "BOS": "Boston Bruins",
    "BUF": "Buffalo Sabres",
    "CGY": "Calgary Flames",
    "CAR": "Carolina Hurricanes",
    "CHI": "Chicago Blackhawks",
    "COL": "Colorado Avalanche",
    "CBJ": "Columbus Blue Jackets",
    "DAL": "Dallas Stars",
    "DET": "Detroit Red Wings",
    "EDM": "Edmonton Oilers",
    "FLA": "Florida Panthers",
    "LAK": "Los Angeles Kings",
    "MIN": "Minnesota Wild",
    "MTL": "Montreal Canadiens",
    "NSH": "Nashville Predators",
    "NJD": "New Jersey Devils",
    "NYI": "New York Islanders",
    "NYR": "New York Rangers",
    "OTT": "Ottawa Senators",
    "PHI": "Philadelphia Flyers",
    "PIT": "Pittsburgh Penguins",
    "SJS": "San Jose Sharks",
    "SEA": "Seattle Kraken",
    "STL": "St. Louis Blues",
    "TBL": "Tampa Bay Lightning",
    "TOR": "Toronto Maple Leafs",
    "UTA": "Utah Hockey Club",
    "VAN": "Vancouver Canucks",
    "VGK": "Vegas Golden Knights",
    "WSH": "Washington Capitals",
    "WPG": "Winnipeg Jets",
}


def _normalize(abbr: str, full_name: str) -> str:
    return _TEAM_MAP.get(abbr.upper(), full_name)


async def fetch_upcoming_nhl_games(client: httpx.AsyncClient) -> list[Game]:
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=settings.days_ahead)
    fetch_date = now.strftime("%Y-%m-%d")

    games: list[Game] = []
    visited: set[str] = set()   # prevent infinite loops on unexpected API responses

    while fetch_date and fetch_date not in visited:
        visited.add(fetch_date)

        # Stop paginating once we've passed the lookahead window
        if datetime.strptime(fetch_date, "%Y-%m-%d").replace(tzinfo=timezone.utc) > cutoff:
            break

        resp = await client.get(f"{_BASE}/{fetch_date}")
        resp.raise_for_status()
        data = resp.json()

        for game_week in data.get("gameWeek", []):
            for game in game_week.get("games", []):
                # gameType 2 = regular season; skip preseason (1) and playoffs (3)
                if game.get("gameType") != _REGULAR_SEASON_TYPE:
                    continue
                # gameState "FUT" = future/scheduled
                if game.get("gameState") != "FUT":
                    continue

                start_time = game.get("startTimeUTC", "")
                # Skip games beyond our window
                if start_time and start_time > cutoff.isoformat():
                    continue

                home = game.get("homeTeam", {})
                away = game.get("awayTeam", {})
                home_abbr = home.get("abbrev", "")
                home_name = home.get("name", {}).get("default", home_abbr)
                away_abbr = away.get("abbrev", "")
                away_name = away.get("name", {}).get("default", away_abbr)

                games.append(Game(
                    category=_CATEGORY,
                    live=0,
                    home_team=_normalize(home_abbr, home_name),
                    away_team=_normalize(away_abbr, away_name),
                    start_time=start_time,
                ))

        # Advance to the next week using the API's own next-page pointer
        fetch_date = data.get("nextStartDate")

    logger.info("NHL: fetched %d upcoming regular season games", len(games))
    return games


async def fetch_live_nhl_games(client: httpx.AsyncClient) -> list[Game]:
    """Fetch only live (in-progress) NHL games. Same schedule, filter gameState LIVE."""
    now = datetime.now(timezone.utc)
    fetch_date = now.strftime("%Y-%m-%d")

    resp = await client.get(f"{_BASE}/{fetch_date}")
    resp.raise_for_status()
    data = resp.json()

    games: list[Game] = []
    for game_week in data.get("gameWeek", []):
        for game in game_week.get("games", []):
            if game.get("gameType") != _REGULAR_SEASON_TYPE:
                continue
            if game.get("gameState") != "LIVE":
                continue

            start_time = game.get("startTimeUTC", "")
            home = game.get("homeTeam", {})
            away = game.get("awayTeam", {})
            home_abbr = home.get("abbrev", "")
            home_name = home.get("name", {}).get("default", home_abbr)
            away_abbr = away.get("abbrev", "")
            away_name = away.get("name", {}).get("default", away_abbr)

            games.append(Game(
                category=_CATEGORY,
                live=1,
                home_team=_normalize(home_abbr, home_name),
                away_team=_normalize(away_abbr, away_name),
                start_time=start_time,
            ))

    logger.info("NHL: fetched %d live games", len(games))
    return games
