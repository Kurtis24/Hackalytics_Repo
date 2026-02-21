"""
CLI entry point for historical odds data collection.

Usage (local):
    python -m Backend.scripts.collect_data \
        --sport NBA \
        --start 2024-10-01 \
        --end 2025-06-30 \
        --output-dir data/raw

Usage (cloud / Docker):
    python -m Backend.scripts.collect_data \
        --sport NBA \
        --start 2024-10-01 \
        --end 2025-06-30 \
        --s3-bucket hackalytics-sportsbook-data \
        --sqs-dlq-url https://sqs.us-east-1.amazonaws.com/.../sportsbook-dlq

    # Run all 4 sports in parallel:
    python -m Backend.scripts.collect_data --sport ALL
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
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

ALL_SPORTS = sorted(SPORT_DEFAULTS.keys())


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Collect historical odds data from the Sportsbook API."
    )
    parser.add_argument(
        "--sport",
        required=True,
        choices=ALL_SPORTS + ["ALL"],
        help="Sport to collect data for, or ALL for all sports in parallel.",
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
        help=f"Output directory for Parquet files (default: {settings.data_output_dir}). Ignored when --s3-bucket is set.",
    )
    parser.add_argument(
        "--s3-bucket",
        default=None,
        help="S3 bucket for output (env: S3_BUCKET).",
    )
    parser.add_argument(
        "--s3-prefix",
        default=None,
        help="S3 key prefix (env: S3_PREFIX, default: raw).",
    )
    parser.add_argument(
        "--sqs-dlq-url",
        default=None,
        help="SQS dead-letter queue URL (env: SQS_DLQ_URL).",
    )
    parser.add_argument(
        "--aws-region",
        default=None,
        help="AWS region (env: AWS_REGION, default: us-east-1).",
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


def _resolve(cli_val: str | None, env_var: str, settings_val: str) -> str:
    """Resolve a value from CLI arg > env var > settings default."""
    if cli_val is not None:
        return cli_val
    env = os.environ.get(env_var, "")
    if env:
        return env
    return settings_val


async def _run_sport(
    sport: str,
    start: str | None,
    end: str | None,
    output_dir: str,
    s3_bucket: str,
    s3_prefix: str,
    sqs_dlq_url: str,
    aws_region: str,
    rate_limit: float,
) -> None:
    """Run collection for a single sport."""
    defaults = SPORT_DEFAULTS[sport]
    s = start or defaults["start"]
    e = end or defaults["end"]

    dest = f"s3://{s3_bucket}/{s3_prefix}" if s3_bucket else output_dir
    logging.info(
        "Collecting %s data from %s to %s (season %s) → %s",
        sport, s, e, SEASON_MAP.get(sport, "unknown"), dest,
    )

    async with SportsbookAPIClient(
        rapidapi_key=settings.rapidapi_key,
        rapidapi_host=settings.rapidapi_host,
        rate_limit_delay=rate_limit,
    ) as client:
        pipeline = DataCollectionPipeline(
            client=client,
            output_dir=output_dir,
            s3_bucket=s3_bucket,
            s3_prefix=s3_prefix,
            sqs_dlq_url=sqs_dlq_url,
            aws_region=aws_region,
        )
        await pipeline.collect(competition=sport, start_date=s, end_date=e)


async def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    if not settings.rapidapi_key:
        logging.error(
            "RAPIDAPI_KEY is not set. Set it in your .env file or environment."
        )
        sys.exit(1)

    # Resolve cloud settings: CLI > env > settings
    s3_bucket = _resolve(args.s3_bucket, "S3_BUCKET", settings.s3_bucket)
    s3_prefix = _resolve(args.s3_prefix, "S3_PREFIX", settings.s3_prefix)
    sqs_dlq_url = _resolve(args.sqs_dlq_url, "SQS_DLQ_URL", settings.sqs_dlq_url)
    aws_region = _resolve(args.aws_region, "AWS_REGION", settings.aws_region)
    output_dir = args.output_dir or settings.data_output_dir
    rate_limit = args.rate_limit if args.rate_limit is not None else settings.api_rate_limit_delay

    sports = ALL_SPORTS if args.sport == "ALL" else [args.sport]

    if len(sports) > 1:
        logging.info("Running %d sports in parallel: %s", len(sports), sports)
        await asyncio.gather(*(
            _run_sport(
                sport, args.start, args.end, output_dir,
                s3_bucket, s3_prefix, sqs_dlq_url, aws_region, rate_limit,
            )
            for sport in sports
        ))
    else:
        await _run_sport(
            sports[0], args.start, args.end, output_dir,
            s3_bucket, s3_prefix, sqs_dlq_url, aws_region, rate_limit,
        )


if __name__ == "__main__":
    asyncio.run(main())
