"""
Aggregates upcoming games from all four leagues (NBA, MLB, NFL, NHL).

Implements FR-02 (all four leagues per cycle, one failure doesn't block others)
and FR-06 (retry up to 3 times with exponential backoff: 1 s / 2 s / 4 s).
Results are sorted by start_time ascending (FR-05).
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable

import httpx

from app.models.game import Game
from app.services.nba_service import fetch_upcoming_nba_games
from app.services.mlb_service import fetch_upcoming_mlb_games
from app.services.nfl_service import fetch_upcoming_nfl_games
from app.services.nhl_service import fetch_upcoming_nhl_games

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_BACKOFF_SECONDS = [1, 2, 4]   # FR-06: 1 s / 2 s / 4 s

LeagueFetcher = Callable[[httpx.AsyncClient], Awaitable[list[Game]]]


async def _fetch_with_retry(
    league: str,
    fetcher: LeagueFetcher,
    client: httpx.AsyncClient,
) -> list[Game]:
    """Call `fetcher` up to _MAX_RETRIES times with exponential backoff."""
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            return await fetcher(client)
        except Exception as exc:
            last_exc = exc
            wait = _BACKOFF_SECONDS[min(attempt, len(_BACKOFF_SECONDS) - 1)]
            logger.warning(
                "%s: attempt %d/%d failed (%s), retrying in %ds",
                league, attempt + 1, _MAX_RETRIES, exc, wait,
            )
            await asyncio.sleep(wait)

    logger.error("%s: all %d retries exhausted — skipping league. Last error: %s", league, _MAX_RETRIES, last_exc)
    return []


async def get_all_upcoming_games() -> list[Game]:
    """
    Fetch upcoming games from all four leagues concurrently.
    Returns a combined list sorted by start_time ascending.
    """
    timeout = httpx.Timeout(10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        nba_task = _fetch_with_retry("NBA", fetch_upcoming_nba_games, client)
        mlb_task = _fetch_with_retry("MLB", fetch_upcoming_mlb_games, client)
        nfl_task = _fetch_with_retry("NFL", fetch_upcoming_nfl_games, client)
        nhl_task = _fetch_with_retry("NHL", fetch_upcoming_nhl_games, client)

        results = await asyncio.gather(nba_task, mlb_task, nfl_task, nhl_task)

    all_games: list[Game] = []
    for league_games in results:
        all_games.extend(league_games)

    all_games.sort(key=lambda g: g.start_time)

    now_iso = datetime.now(timezone.utc).isoformat()
    logger.info("Cycle complete at %s — total upcoming games: %d", now_iso, len(all_games))
    return all_games
