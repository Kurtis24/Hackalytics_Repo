"""
Kalshi data service.

Fetches open binary markets from the public Kalshi market-data API
(no API key required for market data) and normalises them into
PredictionMarketQuote objects.

Docs: https://docs.kalshi.com/getting_started/quick_start_market_data
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings
from app.models.prediction_market import PredictionMarketQuote

logger = logging.getLogger(__name__)

_PAGE_SIZE = 1000  # Kalshi max page size
_PAGE_DELAY = 0.25  # polite delay between pages (seconds)
_MAX_RETRIES = 4


def _dollars(market: dict, key: str) -> float | None:
    """Read a `*_dollars` price string (e.g. '0.450') as a float."""
    raw = market.get(key)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _to_quote(market: dict) -> PredictionMarketQuote | None:
    """Convert a raw Kalshi market dict into a normalised quote.

    Returns None if the market is not a tradable binary market with
    two-sided liquidity.
    """
    if market.get("status") not in ("active", "open"):
        return None
    if market.get("market_type") not in (None, "binary"):
        return None
    # Skip multivariate / parlay markets — their titles are concatenations
    # of several legs and can't be matched to a single real-world event.
    if market.get("mve_selected_legs") or market.get("mve_collection_ticker"):
        return None
    if market.get("is_provisional"):
        return None

    yes_ask = _dollars(market, "yes_ask_dollars")
    no_ask = _dollars(market, "no_ask_dollars")
    yes_bid = _dollars(market, "yes_bid_dollars") or 0.0
    no_bid = _dollars(market, "no_bid_dollars") or 0.0

    # Need a real ask on both sides to trade either leg.
    if not yes_ask or not no_ask or yes_ask >= 1.0 or no_ask >= 1.0:
        return None

    ticker = market.get("ticker", "")
    return PredictionMarketQuote(
        venue="kalshi",
        market_id=str(ticker),
        title=(market.get("title") or market.get("yes_sub_title") or "").strip(),
        yes_ask=round(yes_ask, 4),
        no_ask=round(no_ask, 4),
        yes_bid=round(yes_bid, 4),
        no_bid=round(no_bid, 4),
        end_date=market.get("close_time", "") or "",
        volume=float(market.get("volume_24h_fp") or market.get("volume_fp") or 0.0),
        url=f"https://kalshi.com/markets/{ticker}",
    )


async def _get_page(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    """GET one page with exponential backoff on 429/5xx."""
    for attempt in range(1, _MAX_RETRIES + 1):
        resp = await client.get(url, params=params)
        if resp.status_code == 429 or resp.status_code >= 500:
            wait = 2.0 ** attempt
            logger.warning(
                "Kalshi %s (attempt %d/%d) — waiting %.1fs",
                resp.status_code, attempt, _MAX_RETRIES, wait,
            )
            await asyncio.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    # Final attempt result (raise if still failing)
    resp.raise_for_status()
    return resp.json()


async def fetch_markets(
    client: httpx.AsyncClient,
    limit: int | None = None,
) -> list[PredictionMarketQuote]:
    """Fetch up to `limit` open binary markets via cursor pagination."""
    limit = limit or settings.prediction_market_limit
    base = settings.kalshi_api_url.rstrip("/")

    quotes: list[PredictionMarketQuote] = []
    cursor: str | None = None
    while len(quotes) < limit:
        params: dict[str, object] = {"status": "open", "limit": _PAGE_SIZE}
        if cursor:
            params["cursor"] = cursor

        data = await _get_page(client, f"{base}/markets", params)

        markets = data.get("markets", [])
        if not markets:
            break

        for market in markets:
            quote = _to_quote(market)
            if quote and quote.title:
                quotes.append(quote)

        cursor = data.get("cursor")
        if not cursor:
            break
        await asyncio.sleep(_PAGE_DELAY)

    logger.info("Kalshi: collected %d tradable binary markets", len(quotes))
    return quotes[:limit]
