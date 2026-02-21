"""
MLB upcoming REGULAR SEASON games via the official MLB Stats API.
`gameType=R` restricts results to regular season only (excludes spring training, playoffs, etc).
`startDate / endDate` covers today through `settings.days_ahead` days.
Only games with abstractGameState == "Preview" (not yet started) are returned.
"""

import logging
from datetime import datetime, timezone, timedelta

import httpx

from app.config import settings
from app.models.game import Game

logger = logging.getLogger(__name__)

_BASE = "https://statsapi.mlb.com/api/v1/schedule"
_CATEGORY = "baseball"

# MLB Stats API returns full team names, but we keep a map for any abbreviation fallback
_TEAM_MAP: dict[str, str] = {
    "ARI": "Arizona Diamondbacks",
    "ATL": "Atlanta Braves",
    "BAL": "Baltimore Orioles",
    "BOS": "Boston Red Sox",
    "CHC": "Chicago Cubs",
    "CWS": "Chicago White Sox",
    "CIN": "Cincinnati Reds",
    "CLE": "Cleveland Guardians",
    "COL": "Colorado Rockies",
    "DET": "Detroit Tigers",
    "HOU": "Houston Astros",
    "KC":  "Kansas City Royals",
    "LAA": "Los Angeles Angels",
    "LAD": "Los Angeles Dodgers",
    "MIA": "Miami Marlins",
    "MIL": "Milwaukee Brewers",
    "MIN": "Minnesota Twins",
    "NYM": "New York Mets",
    "NYY": "New York Yankees",
    "OAK": "Oakland Athletics",
    "PHI": "Philadelphia Phillies",
    "PIT": "Pittsburgh Pirates",
    "SD":  "San Diego Padres",
    "SEA": "Seattle Mariners",
    "SF":  "San Francisco Giants",
    "STL": "St. Louis Cardinals",
    "TB":  "Tampa Bay Rays",
    "TEX": "Texas Rangers",
    "TOR": "Toronto Blue Jays",
    "WSH": "Washington Nationals",
}


def _normalize(abbr: str, full_name: str) -> str:
    return _TEAM_MAP.get(abbr.upper(), full_name)


async def fetch_upcoming_mlb_games(client: httpx.AsyncClient) -> list[Game]:
    now = datetime.now(timezone.utc)
    start_date = now.strftime("%Y-%m-%d")
    end_date = (now + timedelta(days=settings.days_ahead)).strftime("%Y-%m-%d")

    resp = await client.get(
        _BASE,
        params={
            "sportId": 1,
            "startDate": start_date,
            "endDate": end_date,
            "gameType": "R",          # Regular season; add "S" for spring training
            "fields": (
                "dates,date,games,gamePk,gameDate,"
                "status,abstractGameState,"
                "teams,home,away,team,name,abbreviation"
            ),
        },
    )
    resp.raise_for_status()
    data = resp.json()

    games: list[Game] = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            state = game.get("status", {}).get("abstractGameState", "")
            if state != "Preview":
                continue

            home_team = game.get("teams", {}).get("home", {}).get("team", {})
            away_team = game.get("teams", {}).get("away", {}).get("team", {})
            home_name = home_team.get("name", "")
            away_name = away_team.get("name", "")
            home_abbr = home_team.get("abbreviation", "")
            away_abbr = away_team.get("abbreviation", "")
            start_time = game.get("gameDate", "")

            games.append(Game(
                category=_CATEGORY,
                live=0,
                home_team=_normalize(home_abbr, home_name),
                away_team=_normalize(away_abbr, away_name),
                start_time=start_time,
            ))

    logger.info("MLB: fetched %d upcoming games", len(games))
    return games
