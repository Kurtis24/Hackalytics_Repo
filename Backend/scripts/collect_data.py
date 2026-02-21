"""
CLI entry point for historical odds data collection.

Usage:
    python -m Backend.scripts.collect_data \
        --sport NBA \
        --start 2024-10-01 \
        --end 2025-06-30 \
        --output-dir data/raw
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from Backend.app.config import settings
from Backend.app.services.data_pipeline import DataCollectionPipeline, SEASON_MAP
from Backend.app.services.sportsbook_client import SportsbookAPIClient

# Default season date ranges per sport
SPORT_DEFAULTS: dict[str, dict[str, str]] = {
    "NBA": {"start": "2024-10-01", "end": "2025-06-30"},
    "NFL": {"start": "2024-09-01", "end": "2025-02-13"},
    "MLB": {"start": "2024-03-28", "end": "2024-11-15"},
    "NHL": {"start": "2024-10-02", "end": "2025-06-30"},
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect historical odds data from the Sportsbook API."
    )
    parser.add_argument(
        "--sport",
        required=True,
        choices=sorted(SPORT_DEFAULTS.keys()),
        help="Sport to collect data for.",
    )
    parser.add_argument(
        "--start",
        default=None,
        help="Start date (ISO format). Defaults to season start for the sport.",
    )
    parser.add_argument(
        "--end",
        default=None,
        help="End date (ISO format). Defaults to season end for the sport.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help=f"Output directory for Parquet files (default: {settings.data_output_dir}).",
    )
    parser.add_argument(
        "--rate-limit",
        type=float,
        default=None,
        help=f"Seconds between API requests (default: {settings.api_rate_limit_delay}).",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable debug logging.",
    )
    return parser.parse_args(argv)


async def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    sport = args.sport
    defaults = SPORT_DEFAULTS[sport]
    start = args.start or defaults["start"]
    end = args.end or defaults["end"]
    output_dir = args.output_dir or settings.data_output_dir
    rate_limit = args.rate_limit if args.rate_limit is not None else settings.api_rate_limit_delay

    if not settings.rapidapi_key:
        logging.error(
            "RAPIDAPI_KEY is not set. Set it in your .env file or environment."
        )
        sys.exit(1)

    logging.info(
        "Collecting %s data from %s to %s (season %s) → %s",
        sport,
        start,
        end,
        SEASON_MAP.get(sport, "unknown"),
        output_dir,
    )

    async with SportsbookAPIClient(
        rapidapi_key=settings.rapidapi_key,
        rapidapi_host=settings.rapidapi_host,
        rate_limit_delay=rate_limit,
    ) as client:
        pipeline = DataCollectionPipeline(client=client, output_dir=output_dir)
        await pipeline.collect(competition=sport, start_date=start, end_date=end)


if __name__ == "__main__":
    asyncio.run(main())
