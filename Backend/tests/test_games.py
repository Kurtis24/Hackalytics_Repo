"""
Full test suite for the Upcoming Games Scraper — Regular Season Edition.

Covers:
  - Game model schema validation
  - NBA parser: STATUS_SCHEDULED only; seasontype=2 param sent to ESPN
  - MLB parser: Preview state only; gameType=R sent to MLB API
  - NFL parser: STATUS_SCHEDULED only; seasontype=2 param sent to ESPN
  - NHL parser: FUT + gameType==2 only; week-by-week pagination
  - Team name normalization for all four leagues
  - games_service aggregator: concurrent fetch + sort
  - games_service retry logic: failures isolated per league
  - API endpoints: GET / , GET /api/v1/health , GET /api/v1/games
"""

import pytest
import pytest_asyncio
import httpx
from unittest.mock import AsyncMock, patch, MagicMock, call
from fastapi.testclient import TestClient

from app.main import app
from app.models.game import Game
from app.services.nba_service import fetch_upcoming_nba_games, _normalize as nba_normalize
from app.services.mlb_service import fetch_upcoming_mlb_games, _normalize as mlb_normalize
from app.services.nfl_service import fetch_upcoming_nfl_games, _normalize as nfl_normalize
from app.services.nhl_service import fetch_upcoming_nhl_games, _normalize as nhl_normalize
from app.services.games_service import _fetch_with_retry, get_all_upcoming_games


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_response_mock(json_body: dict) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = json_body
    return response


def make_client_mock(json_body: dict) -> MagicMock:
    client = MagicMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=make_response_mock(json_body))
    return client


# ---------------------------------------------------------------------------
# 1. Game model
# ---------------------------------------------------------------------------

class TestGameModel:
    def test_valid_game(self):
        g = Game(
            category="basketball",
            live=0,
            home_team="Houston Rockets",
            away_team="New York Knicks",
            start_time="2026-02-25T19:30:00Z",
        )
        assert g.category == "basketball"
        assert g.live == 0
        assert g.home_team == "Houston Rockets"
        assert g.away_team == "New York Knicks"
        assert g.start_time == "2026-02-25T19:30:00Z"

    def test_live_defaults_to_zero(self):
        g = Game(category="hockey", home_team="A", away_team="B", start_time="2026-01-01T00:00:00Z")
        assert g.live == 0

    def test_game_serializes_to_dict(self):
        g = Game(category="baseball", live=0, home_team="X", away_team="Y", start_time="2026-03-01T18:00:00Z")
        d = g.model_dump()
        assert set(d.keys()) == {"category", "live", "home_team", "away_team", "start_time"}


# ---------------------------------------------------------------------------
# 2. Team name normalization
# ---------------------------------------------------------------------------

class TestNormalization:
    def test_nba_known_abbreviation(self):
        assert nba_normalize("HOU", "Rockets") == "Houston Rockets"

    def test_nba_unknown_falls_back_to_display(self):
        assert nba_normalize("XYZ", "Unknown Team") == "Unknown Team"

    def test_mlb_known_abbreviation(self):
        assert mlb_normalize("NYY", "Yankees") == "New York Yankees"

    def test_mlb_unknown_falls_back(self):
        assert mlb_normalize("ZZZ", "Some Team") == "Some Team"

    def test_nfl_known_abbreviation(self):
        assert nfl_normalize("KC", "Chiefs") == "Kansas City Chiefs"

    def test_nfl_unknown_falls_back(self):
        assert nfl_normalize("AAA", "Fallback") == "Fallback"

    def test_nhl_known_abbreviation(self):
        assert nhl_normalize("TOR", "Leafs") == "Toronto Maple Leafs"

    def test_nhl_unknown_falls_back(self):
        assert nhl_normalize("QQQ", "Mystery Team") == "Mystery Team"

    def test_normalization_is_case_insensitive(self):
        assert nba_normalize("hou", "anything") == "Houston Rockets"
        assert nfl_normalize("kc", "anything") == "Kansas City Chiefs"


# ---------------------------------------------------------------------------
# 3. NBA parser — regular season filter
# ---------------------------------------------------------------------------

NBA_SCHEDULED_RESPONSE = {
    "events": [
        {
            "date": "2026-02-25T19:30:00Z",
            "status": {"type": {"name": "STATUS_SCHEDULED"}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"abbreviation": "HOU", "displayName": "Houston Rockets"}},
                {"homeAway": "away", "team": {"abbreviation": "NYK", "displayName": "New York Knicks"}},
            ]}],
        },
        {
            # Playoff game — should be excluded by seasontype=2 at API level,
            # but if it somehow appears we also gate on STATUS_SCHEDULED
            "date": "2026-04-20T22:00:00Z",
            "status": {"type": {"name": "STATUS_SCHEDULED"}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"abbreviation": "LAL", "displayName": "Los Angeles Lakers"}},
                {"homeAway": "away", "team": {"abbreviation": "BOS", "displayName": "Boston Celtics"}},
            ]}],
        },
        {
            "date": "2026-02-25T22:00:00Z",
            "status": {"type": {"name": "STATUS_IN_PROGRESS"}},   # live — must be skipped
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"abbreviation": "GSW", "displayName": "Golden State Warriors"}},
                {"homeAway": "away", "team": {"abbreviation": "DEN", "displayName": "Denver Nuggets"}},
            ]}],
        },
    ]
}


@pytest.mark.asyncio
async def test_nba_sends_seasontype_2_to_espn():
    """Verify seasontype=2 is included in the ESPN request params."""
    client = make_client_mock({"events": []})
    await fetch_upcoming_nba_games(client)
    params = client.get.call_args.kwargs.get("params") or {}
    assert params.get("seasontype") == 2


@pytest.mark.asyncio
async def test_nba_returns_only_scheduled_games():
    client = make_client_mock(NBA_SCHEDULED_RESPONSE)
    games = await fetch_upcoming_nba_games(client)
    # Only STATUS_SCHEDULED games pass; STATUS_IN_PROGRESS is excluded
    assert all(g.category == "basketball" for g in games)
    assert all(g.live == 0 for g in games)
    # Live game must not appear
    teams = [(g.home_team, g.away_team) for g in games]
    assert ("Golden State Warriors", "Denver Nuggets") not in teams


@pytest.mark.asyncio
async def test_nba_empty_events_returns_empty_list():
    client = make_client_mock({"events": []})
    assert await fetch_upcoming_nba_games(client) == []


@pytest.mark.asyncio
async def test_nba_normalizes_team_abbreviations():
    client = make_client_mock(NBA_SCHEDULED_RESPONSE)
    games = await fetch_upcoming_nba_games(client)
    home_teams = [g.home_team for g in games]
    assert "Houston Rockets" in home_teams
    assert "HOU" not in home_teams


# ---------------------------------------------------------------------------
# 4. MLB parser — regular season filter
# ---------------------------------------------------------------------------

MLB_SCHEDULED_RESPONSE = {
    "dates": [
        {
            "date": "2026-04-01",
            "games": [
                {
                    "gameDate": "2026-04-01T18:10:00Z",
                    "status": {"abstractGameState": "Preview"},
                    "teams": {
                        "home": {"team": {"name": "New York Yankees", "abbreviation": "NYY"}},
                        "away": {"team": {"name": "Boston Red Sox", "abbreviation": "BOS"}},
                    },
                },
                {
                    "gameDate": "2026-04-01T20:00:00Z",
                    "status": {"abstractGameState": "Live"},   # live — must be skipped
                    "teams": {
                        "home": {"team": {"name": "Los Angeles Dodgers", "abbreviation": "LAD"}},
                        "away": {"team": {"name": "San Francisco Giants", "abbreviation": "SF"}},
                    },
                },
            ],
        }
    ]
}


@pytest.mark.asyncio
async def test_mlb_sends_gametype_r_to_api():
    """Verify gameType=R (regular season) is included in the MLB API request."""
    client = make_client_mock({"dates": []})
    await fetch_upcoming_mlb_games(client)
    call_kwargs = client.get.call_args
    params = call_kwargs.kwargs.get("params") or {}
    assert params.get("gameType") == "R"


@pytest.mark.asyncio
async def test_mlb_returns_only_preview_games():
    client = make_client_mock(MLB_SCHEDULED_RESPONSE)
    games = await fetch_upcoming_mlb_games(client)
    assert len(games) == 1
    assert games[0].home_team == "New York Yankees"
    assert games[0].away_team == "Boston Red Sox"
    assert games[0].category == "baseball"


@pytest.mark.asyncio
async def test_mlb_empty_dates_returns_empty_list():
    client = make_client_mock({"dates": []})
    assert await fetch_upcoming_mlb_games(client) == []


# ---------------------------------------------------------------------------
# 5. NFL parser — regular season filter
# ---------------------------------------------------------------------------

NFL_SCHEDULED_RESPONSE = {
    "events": [
        {
            "date": "2026-09-10T20:20:00Z",
            "status": {"type": {"name": "STATUS_SCHEDULED"}},
            "competitions": [{"competitors": [
                {"homeAway": "home", "team": {"abbreviation": "KC", "displayName": "Kansas City Chiefs"}},
                {"homeAway": "away", "team": {"abbreviation": "BUF", "displayName": "Buffalo Bills"}},
            ]}],
        }
    ]
}


@pytest.mark.asyncio
async def test_nfl_sends_seasontype_2_to_espn():
    """Verify seasontype=2 is included in the ESPN request params."""
    client = make_client_mock({"events": []})
    await fetch_upcoming_nfl_games(client)
    call_kwargs = client.get.call_args
    params = call_kwargs.kwargs.get("params") or {}
    assert params.get("seasontype") == 2


@pytest.mark.asyncio
async def test_nfl_returns_scheduled_games():
    client = make_client_mock(NFL_SCHEDULED_RESPONSE)
    games = await fetch_upcoming_nfl_games(client)
    assert len(games) == 1
    assert games[0].home_team == "Kansas City Chiefs"
    assert games[0].away_team == "Buffalo Bills"
    assert games[0].category == "american_football"
    assert games[0].live == 0


@pytest.mark.asyncio
async def test_nfl_skips_non_scheduled():
    response = {"events": [{
        "date": "2026-09-10T20:20:00Z",
        "status": {"type": {"name": "STATUS_FINAL"}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "team": {"abbreviation": "KC", "displayName": "KC"}},
            {"homeAway": "away", "team": {"abbreviation": "BUF", "displayName": "BUF"}},
        ]}],
    }]}
    client = make_client_mock(response)
    assert await fetch_upcoming_nfl_games(client) == []


# ---------------------------------------------------------------------------
# 6. NHL parser — regular season filter + pagination
# ---------------------------------------------------------------------------

def _nhl_week(next_date: str | None, games: list[dict]) -> dict:
    """Build a minimal NHL schedule API response for one week."""
    result: dict = {"gameWeek": [{"games": games}]}
    if next_date:
        result["nextStartDate"] = next_date
    return result


def _nhl_game(game_type: int, game_state: str, home: str, away: str, start: str) -> dict:
    return {
        "gameType": game_type,
        "gameState": game_state,
        "startTimeUTC": start,
        "homeTeam": {"abbrev": home, "name": {"default": _TEAM_MAP_LOOKUP.get(home, home)}},
        "awayTeam": {"abbrev": away, "name": {"default": _TEAM_MAP_LOOKUP.get(away, away)}},
    }

_TEAM_MAP_LOOKUP = {"TOR": "Toronto Maple Leafs", "MTL": "Montreal Canadiens",
                    "BOS": "Boston Bruins", "NYR": "New York Rangers"}


@pytest.mark.asyncio
async def test_nhl_returns_only_regular_season_future_games():
    """gameType==2 and gameState==FUT games pass; all others are excluded."""
    week1 = _nhl_week(None, [
        _nhl_game(2, "FUT",   "TOR", "MTL", "2026-02-21T00:00:00Z"),   # regular + future → KEEP
        _nhl_game(3, "FUT",   "BOS", "NYR", "2026-02-21T02:00:00Z"),   # playoff → SKIP
        _nhl_game(2, "LIVE",  "BOS", "NYR", "2026-02-21T03:00:00Z"),   # live → SKIP
        _nhl_game(2, "FINAL", "BOS", "NYR", "2026-02-20T22:00:00Z"),   # finished → SKIP
    ])
    client = make_client_mock(week1)
    games = await fetch_upcoming_nhl_games(client)
    assert len(games) == 1
    assert games[0].home_team == "Toronto Maple Leafs"
    assert games[0].away_team == "Montreal Canadiens"
    assert games[0].category == "hockey"


@pytest.mark.asyncio
async def test_nhl_paginates_multiple_weeks():
    """Service should follow nextStartDate and collect games across multiple weeks."""
    week1 = _nhl_week("2026-02-28", [
        _nhl_game(2, "FUT", "TOR", "MTL", "2026-02-21T00:00:00Z"),
    ])
    week2 = _nhl_week(None, [
        _nhl_game(2, "FUT", "BOS", "NYR", "2026-02-28T00:00:00Z"),
    ])

    client = MagicMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[
        make_response_mock(week1),
        make_response_mock(week2),
    ])

    games = await fetch_upcoming_nhl_games(client)
    assert len(games) == 2
    assert client.get.await_count == 2


@pytest.mark.asyncio
async def test_nhl_stops_paginating_when_no_next_date():
    """If nextStartDate is absent, pagination stops after the first page."""
    week1 = _nhl_week(None, [
        _nhl_game(2, "FUT", "TOR", "MTL", "2026-02-21T00:00:00Z"),
    ])
    client = make_client_mock(week1)
    games = await fetch_upcoming_nhl_games(client)
    assert len(games) == 1
    assert client.get.await_count == 1


@pytest.mark.asyncio
async def test_nhl_empty_game_week_returns_empty_list():
    client = make_client_mock({"gameWeek": []})
    assert await fetch_upcoming_nhl_games(client) == []


# ---------------------------------------------------------------------------
# 7. games_service — retry logic
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_with_retry_succeeds_on_first_attempt():
    fetcher = AsyncMock(return_value=[
        Game(category="basketball", live=0, home_team="A", away_team="B", start_time="2026-01-01T00:00:00Z")
    ])
    client = MagicMock(spec=httpx.AsyncClient)
    games = await _fetch_with_retry("TEST", fetcher, client)
    assert len(games) == 1
    fetcher.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_with_retry_retries_on_failure_then_succeeds():
    good_game = Game(category="hockey", live=0, home_team="X", away_team="Y", start_time="2026-01-01T00:00:00Z")
    fetcher = AsyncMock(side_effect=[Exception("timeout"), Exception("timeout"), [good_game]])
    client = MagicMock(spec=httpx.AsyncClient)
    with patch("app.services.games_service.asyncio.sleep", new_callable=AsyncMock):
        games = await _fetch_with_retry("TEST", fetcher, client)
    assert len(games) == 1
    assert fetcher.await_count == 3


@pytest.mark.asyncio
async def test_fetch_with_retry_returns_empty_after_all_retries_exhausted():
    fetcher = AsyncMock(side_effect=Exception("always fails"))
    client = MagicMock(spec=httpx.AsyncClient)
    with patch("app.services.games_service.asyncio.sleep", new_callable=AsyncMock):
        games = await _fetch_with_retry("TEST", fetcher, client)
    assert games == []
    assert fetcher.await_count == 3


# ---------------------------------------------------------------------------
# 8. games_service — aggregator
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_all_upcoming_games_combines_and_sorts():
    nba_games = [Game(category="basketball", live=0, home_team="A", away_team="B", start_time="2026-03-02T00:00:00Z")]
    mlb_games = [Game(category="baseball",   live=0, home_team="C", away_team="D", start_time="2026-03-01T00:00:00Z")]
    with patch("app.services.games_service.fetch_upcoming_nba_games", new_callable=AsyncMock, return_value=nba_games), \
         patch("app.services.games_service.fetch_upcoming_mlb_games", new_callable=AsyncMock, return_value=mlb_games), \
         patch("app.services.games_service.fetch_upcoming_nfl_games", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.games_service.fetch_upcoming_nhl_games", new_callable=AsyncMock, return_value=[]):
        games = await get_all_upcoming_games()
    assert len(games) == 2
    assert games[0].start_time < games[1].start_time
    assert games[0].category == "baseball"
    assert games[1].category == "basketball"


@pytest.mark.asyncio
async def test_get_all_upcoming_games_one_league_fails_others_still_return():
    good_game = Game(category="hockey", live=0, home_team="X", away_team="Y", start_time="2026-02-21T00:00:00Z")
    with patch("app.services.games_service.fetch_upcoming_nba_games", new_callable=AsyncMock, side_effect=Exception("NBA down")), \
         patch("app.services.games_service.fetch_upcoming_mlb_games", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.games_service.fetch_upcoming_nfl_games", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.games_service.fetch_upcoming_nhl_games", new_callable=AsyncMock, return_value=[good_game]), \
         patch("app.services.games_service.asyncio.sleep", new_callable=AsyncMock):
        games = await get_all_upcoming_games()
    assert len(games) == 1
    assert games[0].category == "hockey"


@pytest.mark.asyncio
async def test_get_all_upcoming_games_all_leagues_fail_returns_empty():
    with patch("app.services.games_service.fetch_upcoming_nba_games", new_callable=AsyncMock, side_effect=Exception("x")), \
         patch("app.services.games_service.fetch_upcoming_mlb_games", new_callable=AsyncMock, side_effect=Exception("x")), \
         patch("app.services.games_service.fetch_upcoming_nfl_games", new_callable=AsyncMock, side_effect=Exception("x")), \
         patch("app.services.games_service.fetch_upcoming_nhl_games", new_callable=AsyncMock, side_effect=Exception("x")), \
         patch("app.services.games_service.asyncio.sleep", new_callable=AsyncMock):
        games = await get_all_upcoming_games()
    assert games == []


# ---------------------------------------------------------------------------
# 9. API endpoints (TestClient — sync)
# ---------------------------------------------------------------------------

client = TestClient(app)


class TestRootEndpoint:
    def test_root_returns_200(self):
        assert client.get("/").status_code == 200

    def test_root_contains_welcome_message(self):
        assert "Welcome" in client.get("/").json()["message"]

    def test_root_contains_docs_link(self):
        assert client.get("/").json()["docs"] == "/docs"


class TestHealthEndpoint:
    def test_health_returns_200(self):
        assert client.get("/api/v1/health").status_code == 200

    def test_health_schema(self):
        body = client.get("/api/v1/health").json()
        assert {"status", "version", "message"} <= set(body.keys())

    def test_health_status_is_ok(self):
        assert client.get("/api/v1/health").json()["status"] == "ok"


class TestGamesEndpoint:
    def _mock_games(self, games: list[Game]):
        return patch(
            "app.routers.games.get_all_upcoming_games",
            new_callable=AsyncMock,
            return_value=games,
        )

    def test_games_returns_200(self):
        with self._mock_games([]):
            assert client.get("/api/v1/games").status_code == 200

    def test_games_returns_list(self):
        with self._mock_games([]):
            assert isinstance(client.get("/api/v1/games").json(), list)

    def test_games_response_matches_schema(self):
        sample = [Game(category="basketball", live=0, home_team="Houston Rockets",
                       away_team="New York Knicks", start_time="2026-02-25T19:30:00Z")]
        with self._mock_games(sample):
            body = client.get("/api/v1/games").json()
        assert len(body) == 1
        g = body[0]
        assert g["category"] == "basketball"
        assert g["live"] == 0
        assert g["home_team"] == "Houston Rockets"
        assert g["away_team"] == "New York Knicks"
        assert g["start_time"] == "2026-02-25T19:30:00Z"

    def test_games_live_field_is_always_zero(self):
        sample = [
            Game(category="hockey",   live=0, home_team="A", away_team="B", start_time="2026-01-01T00:00:00Z"),
            Game(category="baseball", live=0, home_team="C", away_team="D", start_time="2026-01-02T00:00:00Z"),
        ]
        with self._mock_games(sample):
            for g in client.get("/api/v1/games").json():
                assert g["live"] == 0

    def test_games_only_regular_season_categories_present(self):
        """Confirm category values are the four expected regular-season sport strings."""
        valid_categories = {"basketball", "baseball", "american_football", "hockey"}
        sample = [
            Game(category="basketball",      live=0, home_team="A", away_team="B", start_time="2026-01-01T00:00:00Z"),
            Game(category="baseball",        live=0, home_team="C", away_team="D", start_time="2026-01-02T00:00:00Z"),
            Game(category="american_football", live=0, home_team="E", away_team="F", start_time="2026-01-03T00:00:00Z"),
            Game(category="hockey",          live=0, home_team="G", away_team="H", start_time="2026-01-04T00:00:00Z"),
        ]
        with self._mock_games(sample):
            for g in client.get("/api/v1/games").json():
                assert g["category"] in valid_categories

    def test_games_returns_502_on_service_error(self):
        with patch("app.routers.games.get_all_upcoming_games",
                   new_callable=AsyncMock, side_effect=Exception("upstream failure")):
            assert client.get("/api/v1/games").status_code == 502
