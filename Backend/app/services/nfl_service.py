"""
NFL upcoming REGULAR SEASON games via the ESPN public scoreboard API.
`seasontype=2` restricts ESPN's response to regular season only (1=pre, 2=regular, 3=post).
`dates` covers today through `settings.days_ahead` days to capture the full remaining schedule.
Only games with status "STATUS_SCHEDULED" (not yet started) are returned.
"""

import logging
from datetime import datetime, timezone, timedelta

import httpx

from app.config import settings
from app.models.game import Game

logger = logging.getLogger(__name__)

_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
_CATEGORY = "american_football"

_TEAM_MAP: dict[str, str] = {
    "ARI": "Arizona Cardinals",
    "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens",
    "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers",
    "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals",
    "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys",
    "DEN": "Denver Broncos",
    "DET": "Detroit Lions",
    "GB":  "Green Bay Packers",
    "HOU": "Houston Texans",
    "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars",
    "KC":  "Kansas City Chiefs",
    "LAC": "Los Angeles Chargers",
    "LAR": "Los Angeles Rams",
    "LV":  "Las Vegas Raiders",
    "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings",
    "NE":  "New England Patriots",
    "NO":  "New Orleans Saints",
    "NYG": "New York Giants",
    "NYJ": "New York Jets",
    "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers",
    "SEA": "Seattle Seahawks",
    "SF":  "San Francisco 49ers",
    "TB":  "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans",
    "WSH": "Washington Commanders",
}


def _normalize(abbr: str, display_name: str) -> str:
    return _TEAM_MAP.get(abbr.upper(), display_name)


async def fetch_upcoming_nfl_games(client: httpx.AsyncClient) -> list[Game]:
    now = datetime.now(timezone.utc)
    start = now.strftime("%Y%m%d")
    end = (now + timedelta(days=settings.days_ahead)).strftime("%Y%m%d")

    resp = await client.get(_BASE, params={
        "dates": f"{start}-{end}",
        "seasontype": 2,   # 2 = regular season; excludes preseason (1) and playoffs (3)
    })
    resp.raise_for_status()
    data = resp.json()

    games: list[Game] = []
    for event in data.get("events", []):
        status_type = event.get("status", {}).get("type", {}).get("name", "")
        if status_type != "STATUS_SCHEDULED":
            continue

        competition = event.get("competitions", [{}])[0]
        competitors = competition.get("competitors", [])

        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home or not away:
            continue

        home_abbr = home.get("team", {}).get("abbreviation", "")
        home_display = home.get("team", {}).get("displayName", home_abbr)
        away_abbr = away.get("team", {}).get("abbreviation", "")
        away_display = away.get("team", {}).get("displayName", away_abbr)
        start_time = event.get("date", "")

        games.append(Game(
            category=_CATEGORY,
            live=0,
            home_team=_normalize(home_abbr, home_display),
            away_team=_normalize(away_abbr, away_display),
            start_time=start_time,
        ))

    logger.info("NFL: fetched %d upcoming games", len(games))
    return games


async def fetch_live_nfl_games(client: httpx.AsyncClient) -> list[Game]:
    """Fetch only in-progress (live) NFL games. Same scoreboard, filter STATUS_IN_PROGRESS."""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y%m%d")

    resp = await client.get(_BASE, params={
        "dates": today,
        "seasontype": 2,
    })
    resp.raise_for_status()
    data = resp.json()

    games: list[Game] = []
    for event in data.get("events", []):
        status_type = event.get("status", {}).get("type", {}).get("name", "")
        if status_type != "STATUS_IN_PROGRESS":
            continue

        competition = event.get("competitions", [{}])[0]
        competitors = competition.get("competitors", [])
        home = next((c for c in competitors if c.get("homeAway") == "home"), None)
        away = next((c for c in competitors if c.get("homeAway") == "away"), None)
        if not home or not away:
            continue

        home_abbr = home.get("team", {}).get("abbreviation", "")
        home_display = home.get("team", {}).get("displayName", home_abbr)
        away_abbr = away.get("team", {}).get("abbreviation", "")
        away_display = away.get("team", {}).get("displayName", away_abbr)
        start_time = event.get("date", "")

        games.append(Game(
            category=_CATEGORY,
            live=1,
            home_team=_normalize(home_abbr, home_display),
            away_team=_normalize(away_abbr, away_display),
            start_time=start_time,
        ))

    logger.info("NFL: fetched %d live games", len(games))
    return games
