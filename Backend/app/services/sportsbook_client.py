"""
Async client for the Sportsbook API (hosted on RapidAPI).

Handles rate limiting, retries with exponential backoff, and provides
typed methods for each endpoint used in data collection.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

# Retryable HTTP status codes
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
_MAX_RETRIES = 5
_BACKOFF_BASE = 2.0  # seconds


class SportsbookAPIClient:
    """Thin async wrapper around the Sportsbook RapidAPI endpoints."""

    BASE_URL = "https://sportsbook-api2.p.rapidapi.com"

    def __init__(
        self,
        rapidapi_key: str,
        rapidapi_host: str = "sportsbook-api2.p.rapidapi.com",
        rate_limit_delay: float = 0.5,
    ) -> None:

        self._headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": rapidapi_host,
        }
        print(self._headers)
        self._delay = rate_limit_delay
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers=self._headers,
            timeout=30.0,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> SportsbookAPIClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _request(self, method: str, path: str, **kwargs) -> dict | list:
        """Execute an HTTP request with rate limiting and retry logic."""
        await asyncio.sleep(self._delay)

        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                resp = await self._client.request(method, path, **kwargs)

                if resp.status_code in _RETRYABLE_STATUSES:
                    wait = _BACKOFF_BASE**attempt
                    logger.warning(
                        "Retryable status %s on %s (attempt %d/%d), waiting %.1fs",
                        resp.status_code,
                        path,
                        attempt,
                        _MAX_RETRIES,
                        wait,
                    )
                    await asyncio.sleep(wait)
                    continue

                resp.raise_for_status()
                return resp.json()

            except httpx.HTTPStatusError:
                raise
            except httpx.HTTPError as exc:
                last_exc = exc
                wait = _BACKOFF_BASE**attempt
                logger.warning(
                    "Request error on %s (attempt %d/%d): %s — retrying in %.1fs",
                    path,
                    attempt,
                    _MAX_RETRIES,
                    exc,
                    wait,
                )
                await asyncio.sleep(wait)

        raise httpx.HTTPError(
            f"Max retries exceeded for {path}"
        ) from last_exc

    async def _get(self, path: str, params: dict | None = None) -> dict | list:
        return await self._request("GET", path, params=params)

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    async def get_events(
        self,
        competition: str,
        start: str,
        end: str,
    ) -> list[dict]:
        """Fetch events for a competition within a date range.

        Args:
            competition: Competition slug (e.g. "NBA", "NFL").
            start: ISO date string for startTimeFrom.
            end: ISO date string for startTimeTo.
        """
        data = await self._get(
            f"/v1/competitions/{competition}/events",
            params={"startTimeFrom": start, "startTimeTo": end},
        )
        if isinstance(data, dict):
            return data.get("data", data.get("events", []))
        return data

    async def get_event_markets(self, event_key: str) -> list[dict]:
        """Fetch all markets for a given event."""
        data = await self._get(f"/v0/events/{event_key}/markets")
        if isinstance(data, dict):
            # Response is {"events": [{"markets": [...]}]} — markets are nested
            events = data.get("events", [])
            if events and isinstance(events, list):
                return events[0].get("markets", [])
            return data.get("data", data.get("markets", []))
        return data

    async def get_market_outcomes(
        self,
        market_key: str,
        source: str | None = None,
        is_live: bool | None = None,
    ) -> list[dict]:
        """Fetch all historical odds for a market.

        Args:
            market_key: The market identifier.
            source: Optional sportsbook source filter.
            is_live: Optional filter for live vs pre-game odds.
        """
        params: dict = {}
        if source is not None:
            params["source"] = source
        if is_live is not None:
            params["isLive"] = str(is_live).lower()

        data = await self._get(
            f"/v0/markets/{market_key}/outcomes",
            params=params or None,
        )
        if isinstance(data, dict):
            return data.get("data", data.get("outcomes", []))
        return data

    async def get_opening_odds(self, market_key: str) -> list[dict]:
        """Fetch opening odds per sportsbook for a market."""
        data = await self._get(f"/v1/markets/{market_key}/outcomes/opening")
        if isinstance(data, dict):
            return data.get("data", data.get("outcomes", []))
        return data

    async def get_closing_odds(self, market_key: str) -> list[dict]:
        """Fetch closing odds per sportsbook for a market."""
        data = await self._get(f"/v1/markets/{market_key}/outcomes/closing")
        if isinstance(data, dict):
            return data.get("data", data.get("outcomes", []))
        return data
