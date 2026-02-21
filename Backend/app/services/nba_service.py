"""
NBA upcoming REGULAR SEASON games via the ESPN public scoreboard API.
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

_BASE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
_CATEGORY = "basketball"

# ESPN uses abbreviations — map to full official names
_TEAM_MAP: dict[str, str] = {
    "ATL": "Atlanta Hawks",
    "BOS": "Boston Celtics",
    "BKN": "Brooklyn Nets",
    "CHA": "Charlotte Hornets",
    "CHI": "Chicago Bulls",
    "CLE": "Cleveland Cavaliers",
    "DAL": "Dallas Mavericks",
    "DEN": "Denver Nuggets",
    "DET": "Detroit Pistons",
    "GSW": "Golden State Warriors",
    "HOU": "Houston Rockets",
    "IND": "Indiana Pacers",
    "LAC": "LA Clippers",
    "LAL": "Los Angeles Lakers",
    "MEM": "Memphis Grizzlies",
    "MIA": "Miami Heat",
    "MIL": "Milwaukee Bucks",
    "MIN": "Minnesota Timberwolves",
    "NOP": "New Orleans Pelicans",
    "NYK": "New York Knicks",
    "OKC": "Oklahoma City Thunder",
    "ORL": "Orlando Magic",
    "PHI": "Philadelphia 76ers",
    "PHX": "Phoenix Suns",
    "POR": "Portland Trail Blazers",
    "SAC": "Sacramento Kings",
    "SAS": "San Antonio Spurs",
    "TOR": "Toronto Raptors",
    "UTA": "Utah Jazz",
    "WAS": "Washington Wizards",
}


def _normalize(abbr: str, display_name: str) -> str:
    return _TEAM_MAP.get(abbr.upper(), display_name)


async def fetch_upcoming_nba_games(client: httpx.AsyncClient) -> list[Game]:
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

    logger.info("NBA: fetched %d upcoming games", len(games))
    return games
