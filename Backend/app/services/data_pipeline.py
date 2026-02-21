"""
Data collection pipeline: fetches events, markets, and odds from the
Sportsbook API and writes Parquet files partitioned by sport/season.

Supports both local filesystem and S3 output, with optional SQS dead-letter
queue for failed API calls.
"""

from __future__ import annotations

import io
import json
import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from Backend.app.services.sportsbook_client import SportsbookAPIClient

logger = logging.getLogger(__name__)

# Market types and segment we care about
_TARGET_MARKET_TYPES = {"MONEYLINE", "POINT_SPREAD", "POINT_TOTAL"}
_TARGET_SEGMENT = "FULL_MATCH"

# Season lookup (sport -> season label for the current collection window)
SEASON_MAP: dict[str, str] = {
    "NBA": "2024-25",
    "NFL": "2024-25",
    "MLB": "2024",
    "NHL": "2024-25",
}


class DataCollectionPipeline:
    """Orchestrates data collection from the Sportsbook API."""

    def __init__(
        self,
        client: SportsbookAPIClient,
        output_dir: str = "data/raw",
        s3_bucket: str = "",
        s3_prefix: str = "raw",
        sqs_dlq_url: str = "",
        aws_region: str = "us-east-1",
    ) -> None:
        self._client = client
        self._output_dir = Path(output_dir)
        self._s3_bucket = s3_bucket
        self._s3_prefix = s3_prefix
        self._sqs_dlq_url = sqs_dlq_url
        self._aws_region = aws_region

        # Lazy-init AWS clients only when needed
        self._s3_client = None
        self._sqs_client = None

    def _get_s3_client(self):
        if self._s3_client is None:
            import boto3
            self._s3_client = boto3.client("s3", region_name=self._aws_region)
        return self._s3_client

    def _get_sqs_client(self):
        if self._sqs_client is None:
            import boto3
            self._sqs_client = boto3.client("sqs", region_name=self._aws_region)
        return self._sqs_client

    @property
    def _use_s3(self) -> bool:
        return bool(self._s3_bucket)

    @property
    def _use_dlq(self) -> bool:
        return bool(self._sqs_dlq_url)

    # ------------------------------------------------------------------
    # Checkpoint helpers
    # ------------------------------------------------------------------

    def _checkpoint_s3_key(self, competition: str, season: str) -> str:
        return f"checkpoints/{competition}_{season}.json"

    def _checkpoint_path(self, competition: str, season: str) -> Path:
        path = self._output_dir / f".checkpoint_{competition}_{season}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _load_checkpoint(self, competition: str, season: str) -> set[str]:
        if self._use_s3:
            try:
                s3 = self._get_s3_client()
                key = self._checkpoint_s3_key(competition, season)
                resp = s3.get_object(Bucket=self._s3_bucket, Key=key)
                data = json.loads(resp["Body"].read().decode("utf-8"))
                return set(data)
            except s3.exceptions.NoSuchKey:
                return set()
            except Exception:
                logger.debug("No S3 checkpoint found for %s/%s", competition, season)
                return set()
        else:
            cp = self._checkpoint_path(competition, season)
            if cp.exists():
                return set(json.loads(cp.read_text()))
            return set()

    def _save_checkpoint(
        self, competition: str, season: str, completed: set[str]
    ) -> None:
        payload = json.dumps(sorted(completed))
        if self._use_s3:
            s3 = self._get_s3_client()
            key = self._checkpoint_s3_key(competition, season)
            s3.put_object(
                Bucket=self._s3_bucket,
                Key=key,
                Body=payload.encode("utf-8"),
                ContentType="application/json",
            )
        else:
            cp = self._checkpoint_path(competition, season)
            cp.write_text(payload)

    # ------------------------------------------------------------------
    # Parquet writing
    # ------------------------------------------------------------------

    @staticmethod
    def _make_timestamp() -> str:
        return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    def _write_parquet(self, rows: list[dict], path_or_key: str) -> None:
        if not rows:
            logger.info("No rows to write for %s", path_or_key)
            return
        table = pa.Table.from_pylist(rows)

        if self._use_s3:
            buf = io.BytesIO()
            pq.write_table(table, buf)
            buf.seek(0)
            s3 = self._get_s3_client()
            s3.put_object(
                Bucket=self._s3_bucket,
                Key=path_or_key,
                Body=buf.getvalue(),
                ContentType="application/octet-stream",
            )
            logger.info(
                "Wrote %d rows to s3://%s/%s", len(rows), self._s3_bucket, path_or_key
            )
        else:
            local_path = Path(path_or_key)
            local_path.parent.mkdir(parents=True, exist_ok=True)
            pq.write_table(table, str(local_path))
            logger.info("Wrote %d rows to %s", len(rows), local_path)

    # ------------------------------------------------------------------
    # SQS dead-letter queue
    # ------------------------------------------------------------------

    def _send_to_dlq(
        self,
        market_key: str,
        call_type: str,
        competition: str,
        season: str,
        event_flat: dict,
        market_flat: dict,
        error: Exception,
    ) -> None:
        if not self._use_dlq:
            return
        try:
            sqs = self._get_sqs_client()
            message = {
                "market_key": market_key,
                "call_type": call_type,
                "competition": competition,
                "season": season,
                "event_flat": event_flat,
                "market_flat": market_flat,
                "error": f"{type(error).__name__}: {error}",
                "attempt_count": 1,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            sqs.send_message(
                QueueUrl=self._sqs_dlq_url,
                MessageBody=json.dumps(message, default=str),
            )
            logger.info("Sent DLQ message for %s/%s", call_type, market_key)
        except Exception:
            logger.exception("Failed to send DLQ message for %s/%s", call_type, market_key)

    # ------------------------------------------------------------------
    # Row builders — flatten API responses into flat dicts
    # ------------------------------------------------------------------

    @staticmethod
    def _flatten_event(event: dict) -> dict:
        participants = event.get("participants", [])
        home_participant_key = event.get("homeParticipantKey", event.get("home_participant_key", ""))
        home_key = ""
        away_key = ""
        home_name = ""
        away_name = ""
        for p in participants:
            if p.get("key", "") == home_participant_key:
                home_key = p.get("key", "")
                home_name = p.get("name", "")
            else:
                away_key = p.get("key", "")
                away_name = p.get("name", "")

        ci = event.get("competitionInstance", event.get("competition_instance", {})) or {}
        return {
            "event_key": event.get("key", ""),
            "event_name": event.get("name", ""),
            "event_start_time": event.get("startTime", event.get("start_time", "")),
            "home_participant_key": home_key,
            "away_participant_key": away_key,
            "home_participant_name": home_name,
            "away_participant_name": away_name,
            "competition_instance_name": ci.get("name", ""),
            "competition_instance_start": ci.get("startDate", ci.get("start_date", "")),
            "competition_instance_end": ci.get("endDate", ci.get("end_date", "")),
        }

    @staticmethod
    def _flatten_market(market: dict, event_flat: dict) -> dict:
        return {
            **event_flat,
            "market_key": market.get("key", ""),
            "market_type": market.get("type", market.get("marketType", "")),
            "market_segment": market.get("segment", market.get("marketSegment", "")),
            "market_participant_key": market.get("participantKey", market.get("participant_key", "")),
        }

    @staticmethod
    def _flatten_outcome(outcome: dict, market_flat: dict) -> dict:
        return {
            **market_flat,
            "outcome_key": outcome.get("key", outcome.get("outcomeKey", "")),
            "modifier": outcome.get("modifier", ""),
            "payout": outcome.get("payout", None),
            "outcome_type": outcome.get("type", outcome.get("outcomeType", "")),
            "live": outcome.get("live", outcome.get("isLive", None)),
            "read_at": outcome.get("readAt", outcome.get("read_at", "")),
            "last_found_at": outcome.get("lastFoundAt", outcome.get("last_found_at", "")),
            "source": outcome.get("source", ""),
            "participant_key": outcome.get("participantKey", outcome.get("participant_key", "")),
        }

    # ------------------------------------------------------------------
    # Market filtering
    # ------------------------------------------------------------------

    @staticmethod
    def _is_target_market(market: dict) -> bool:
        m_type = market.get("type", market.get("marketType", ""))
        m_seg = market.get("segment", market.get("marketSegment", ""))
        return m_type in _TARGET_MARKET_TYPES and m_seg == _TARGET_SEGMENT

    # ------------------------------------------------------------------
    # Output path helpers
    # ------------------------------------------------------------------

    def _output_key(
        self, table_name: str, competition: str, season: str, timestamp: str
    ) -> str:
        filename = f"{table_name}_{timestamp}.parquet"
        relative = f"{table_name}/sport={competition}/season={season}/{filename}"
        if self._use_s3:
            return f"{self._s3_prefix}/{relative}"
        return str(self._output_dir / relative)

    # ------------------------------------------------------------------
    # Main collection
    # ------------------------------------------------------------------

    async def collect(
        self,
        competition: str,
        start_date: str,
        end_date: str,
    ) -> None:
        """Run the full collection pipeline for a competition and date range."""
        season = SEASON_MAP.get(competition, "unknown")
        completed_events = self._load_checkpoint(competition, season)

        logger.info(
            "Starting collection for %s season %s (%s -> %s). %d events already completed.",
            competition,
            season,
            start_date,
            end_date,
            len(completed_events),
        )

        # 1. Fetch events
        events = await self._client.get_events(competition, start_date, end_date)
        logger.info("Fetched %d events for %s", len(events), competition)

        # Accumulators
        event_rows: list[dict] = []
        outcome_rows: list[dict] = []
        opening_rows: list[dict] = []
        closing_rows: list[dict] = []

        for i, event in enumerate(events, 1):
            event_key = event.get("key", "")
            if not event_key:
                continue

            event_flat = self._flatten_event(event)
            event_rows.append(event_flat)

            if event_key in completed_events:
                logger.debug("Skipping already-completed event %s", event_key)
                continue

            logger.info(
                "[%s] Event %d/%d: %s (%s)",
                competition,
                i,
                len(events),
                event_flat["event_name"],
                event_key,
            )

            # 2. Fetch markets for this event
            try:
                markets = await self._client.get_event_markets(event_key)
            except Exception:
                logger.exception("Failed to fetch markets for event %s", event_key)
                continue

            target_markets = [m for m in markets if self._is_target_market(m)]
            logger.info(
                "  %d markets total, %d target markets",
                len(markets),
                len(target_markets),
            )

            for j, market in enumerate(target_markets, 1):
                market_key = market.get("key", "")
                if not market_key:
                    continue

                market_flat = self._flatten_market(market, event_flat)
                logger.debug(
                    "  Market %d/%d: %s (%s)",
                    j,
                    len(target_markets),
                    market_flat["market_type"],
                    market_key,
                )

                # 3a. Historical outcomes
                try:
                    outcomes = await self._client.get_market_outcomes(market_key)
                    for o in outcomes:
                        outcome_rows.append(self._flatten_outcome(o, market_flat))
                except Exception as exc:
                    logger.exception(
                        "Failed to fetch outcomes for market %s", market_key
                    )
                    self._send_to_dlq(
                        market_key, "outcomes", competition, season,
                        event_flat, market_flat, exc,
                    )

                # 3b. Opening odds
                try:
                    opening = await self._client.get_opening_odds(market_key)
                    for o in (opening if isinstance(opening, list) else [opening]):
                        opening_rows.append(self._flatten_outcome(o, market_flat))
                except Exception as exc:
                    logger.exception(
                        "Failed to fetch opening odds for market %s", market_key
                    )
                    self._send_to_dlq(
                        market_key, "opening", competition, season,
                        event_flat, market_flat, exc,
                    )

                # 3c. Closing odds
                try:
                    closing = await self._client.get_closing_odds(market_key)
                    for o in (closing if isinstance(closing, list) else [closing]):
                        closing_rows.append(self._flatten_outcome(o, market_flat))
                except Exception as exc:
                    logger.exception(
                        "Failed to fetch closing odds for market %s", market_key
                    )
                    self._send_to_dlq(
                        market_key, "closing", competition, season,
                        event_flat, market_flat, exc,
                    )

            # Mark event as done
            completed_events.add(event_key)
            self._save_checkpoint(competition, season, completed_events)

        # 4. Write Parquet files
        ts = self._make_timestamp()
        self._write_parquet(
            event_rows, self._output_key("events", competition, season, ts)
        )
        self._write_parquet(
            outcome_rows, self._output_key("outcomes", competition, season, ts)
        )
        self._write_parquet(
            opening_rows, self._output_key("opening_odds", competition, season, ts)
        )
        self._write_parquet(
            closing_rows, self._output_key("closing_odds", competition, season, ts)
        )

        logger.info(
            "Collection complete for %s season %s: %d events, %d outcomes, "
            "%d opening, %d closing",
            competition,
            season,
            len(event_rows),
            len(outcome_rows),
            len(opening_rows),
            len(closing_rows),
        )
