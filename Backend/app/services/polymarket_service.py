"""
Polymarket data service.

Fetches active binary (Yes/No) markets from the public Polymarket Gamma
API (no API key required) and normalises them into PredictionMarketQuote
objects with executable best-bid/ask prices.

Gamma docs: https://docs.polymarket.com/developers/gamma-markets-api
"""

from __future__ import annotations

import json
import logging

import httpx

from app.config import settings
from app.models.prediction_market import PredictionMarketQuote

logger = logging.getLogger(__name__)

_PAGE_SIZE = 100  # Gamma max page size


def _parse_json_list(raw) -> list:
    """Gamma returns some array fields as JSON-encoded strings."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str) and raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return []
    return []


def _to_quote(market: dict) -> PredictionMarketQuote | None:
    """Convert a raw Gamma market dict into a normalised quote.

    Returns None if the market isn't a tradable binary Yes/No market.
    """
    outcomes = [str(o).lower() for o in _parse_json_list(market.get("outcomes"))]
    if sorted(outcomes) != ["no", "yes"]:
        return None
    if not market.get("acceptingOrders", False):
        return None

    # best_bid / best_ask are the executable YES prices (dollars 0-1).
    try:
        best_bid = float(market.get("bestBid"))
        best_ask = float(market.get("bestAsk"))
    except (TypeError, ValueError):
        return None

    if best_ask <= 0.0 or best_bid <= 0.0:
        return None

    # In a binary market: buying NO ≈ 1 − (best YES bid); selling NO ≈ 1 − (best YES ask).
    yes_ask = round(best_ask, 4)
    no_ask = round(1.0 - best_bid, 4)
    yes_bid = round(best_bid, 4)
    no_bid = round(1.0 - best_ask, 4)

    slug = market.get("slug", market.get("id", ""))
    return PredictionMarketQuote(
        venue="polymarket",
        market_id=str(slug),
        title=market.get("question", "").strip(),
        yes_ask=yes_ask,
        no_ask=no_ask,
        yes_bid=yes_bid,
        no_bid=no_bid,
        end_date=market.get("endDate", "") or "",
        volume=float(market.get("volume24hr") or market.get("volumeNum") or 0.0),
        url=f"https://polymarket.com/event/{slug}",
    )


async def fetch_markets(
    client: httpx.AsyncClient,
    limit: int | None = None,
) -> list[PredictionMarketQuote]:
    """Fetch up to `limit` active binary markets, ordered by 24h volume.

    Pages through the Gamma /markets endpoint until `limit` quotes are
    collected or the results are exhausted.
    """
    limit = limit or settings.prediction_market_limit
    base = settings.polymarket_gamma_url.rstrip("/")

    quotes: list[PredictionMarketQuote] = []
    offset = 0
    while len(quotes) < limit:
        resp = await client.get(
            f"{base}/markets",
            params={
                "active": "true",
                "closed": "false",
                "archived": "false",
                "order": "volume24hr",
                "ascending": "false",
                "limit": _PAGE_SIZE,
                "offset": offset,
            },
        )
        resp.raise_for_status()
        page = resp.json()
        if not page:
            break

        for market in page:
            quote = _to_quote(market)
            if quote and quote.title:
                quotes.append(quote)

        offset += _PAGE_SIZE
        if len(page) < _PAGE_SIZE:
            break

    logger.info("Polymarket: collected %d tradable binary markets", len(quotes))
    return quotes[:limit]
