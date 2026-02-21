"""
Data collection pipeline: fetches events, markets, and odds from the
Sportsbook API and writes Parquet files partitioned by sport/season.
"""

from __future__ import annotations
from Backend.app.services.sportsbook_client import SportsbookAPIClient
from Backend.app.config import settings
import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


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

    ) -> None:
        self._client = client
        self._output_dir = Path(output_dir)

    # ------------------------------------------------------------------
    # Checkpoint helpers
    # ------------------------------------------------------------------

    def _checkpoint_path(self, competition: str, season: str) -> Path:
        path = self._output_dir / f".checkpoint_{competition}_{season}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _load_checkpoint(self, competition: str, season: str) -> set[str]:
        cp = self._checkpoint_path(competition, season)
        if cp.exists():
            return set(json.loads(cp.read_text()))
        return set()

    def _save_checkpoint(
        self, competition: str, season: str, completed: set[str]
    ) -> None:
        cp = self._checkpoint_path(competition, season)
        cp.write_text(json.dumps(sorted(completed)))

    # ------------------------------------------------------------------
    # Parquet writing
    # ------------------------------------------------------------------

    @staticmethod
    def _write_parquet(rows: list[dict], path: Path) -> None:
        if not rows:
            logger.info("No rows to write for %s", path)
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        table = pa.Table.from_pylist(rows)
        pq.write_table(table, str(path))
        logger.info("Wrote %d rows to %s", len(rows), path)

    # ------------------------------------------------------------------
    # Row builders — flatten API responses into flat dicts
    # ------------------------------------------------------------------

    @staticmethod
    def _flatten_event(event: dict) -> dict:
        participants = event.get("participants", [])
        home_participant_key = event.get(
            "homeParticipantKey", event.get("home_participant_key", ""))
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

        ci = event.get("competitionInstance", event.get(
            "competition_instance", {})) or {}
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
        # Opening/closing endpoints nest participant info in a dict
        participant = outcome.get("participant") or {}
        participant_key = (
            outcome.get("participantKey")
            or outcome.get("participant_key")
            or participant.get("key", "")
        )
        # Opening/closing endpoints use "time" instead of readAt/lastFoundAt
        time_field = outcome.get("time", "")
        return {
            **market_flat,
            "outcome_key": outcome.get("key", outcome.get("outcomeKey", "")),
            "modifier": outcome.get("modifier", ""),
            "payout": outcome.get("payout", None),
            "outcome_type": outcome.get("type", outcome.get("outcomeType", "")),
            "live": outcome.get("live", outcome.get("isLive", None)),
            "read_at": outcome.get("readAt", outcome.get("read_at", "")) or time_field,
            "last_found_at": outcome.get("lastFoundAt", outcome.get("last_found_at", "")) or time_field,
            "source": outcome.get("source", ""),
            "participant_key": participant_key,
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
    # Timestamp imputation
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_iso(ts: str) -> datetime | None:
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return None

    @staticmethod
    def _impute_timestamps(
        outcomes: list[dict],
        opening_time: datetime,
        closing_time: datetime,
    ) -> list[dict]:
        """Fill in missing timestamps on historical outcomes.

        Outcomes are assumed sorted ascending by time.  For each
        (source, participantKey) group, outcomes that lack both
        ``lastFoundAt`` and ``readAt`` are assigned evenly-spaced
        timestamps between *opening_time* and *closing_time*.
        """
        from itertools import groupby
        from operator import itemgetter

        def _group_key(o: dict) -> tuple[str, str]:
            return (
                o.get("source", ""),
                o.get("participantKey", o.get("participant_key", "")),
            )

        total_seconds = (closing_time - opening_time).total_seconds()

        sorted_outcomes = sorted(outcomes, key=_group_key)
        result: list[dict] = []
        for _key, group in groupby(sorted_outcomes, key=_group_key):
            items = list(group)
            # Find indices that need imputation
            missing_idxs = [
                i for i, o in enumerate(items)
                if not (o.get("lastFoundAt") or o.get("last_found_at")
                        or o.get("readAt") or o.get("read_at"))
            ]
            if missing_idxs and total_seconds > 0:
                n = len(missing_idxs)
                for rank, idx in enumerate(missing_idxs):
                    # Spread evenly: first gets opening, last gets closing
                    frac = rank / max(n - 1, 1)
                    imputed = opening_time.timestamp() + frac * total_seconds
                    ts = datetime.fromtimestamp(
                        imputed, tz=timezone.utc
                    ).isoformat()
                    items[idx] = {**items[idx], "lastFoundAt": ts}
            result.extend(items)
        return result

    # ------------------------------------------------------------------
    # Flush accumulated rows to Parquet
    # ------------------------------------------------------------------

    def _flush_parquet(
        self,
        competition: str,
        season: str,
        event_rows: list[dict],
        outcome_rows: list[dict],
        opening_rows: list[dict],
        closing_rows: list[dict],
    ) -> None:
        base = self._output_dir
        self._write_parquet(
            event_rows,
            base /
            f"events/sport={competition}/season={season}/events.parquet",
        )
        self._write_parquet(
            outcome_rows,
            base /
            f"outcomes/sport={competition}/season={season}/outcomes.parquet",
        )
        self._write_parquet(
            opening_rows,
            base /
            f"opening_odds/sport={competition}/season={season}/opening.parquet",
        )
        self._write_parquet(
            closing_rows,
            base /
            f"closing_odds/sport={competition}/season={season}/closing.parquet",
        )

    # ------------------------------------------------------------------
    # Main collection
    # ------------------------------------------------------------------

    async def collect(
        self,
        competition: str,
        start_date: str,
        end_date: str,
    ) -> None:
        """Run the full collection pipeline for a competition and date range.

        Args:
            competition: Sport/competition slug (e.g. "NBA").
            start_date: ISO date string (inclusive).
            end_date: ISO date string (inclusive).
        """
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

        interrupted = False
        try:
            for i, event in enumerate(events, 1):
                event_key = event.get("key", "")
                if not event_key:
                    continue

                event_flat = self._flatten_event(event)
                event_rows.append(event_flat)

                if event_key in completed_events:
                    logger.debug(
                        "Skipping already-completed event %s", event_key)
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
                    logger.exception(
                        "Failed to fetch markets for event %s", event_key)
                    continue

                target_markets = [
                    m for m in markets if self._is_target_market(m)]
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
                    # 3a. Opening odds
                    opening: list[dict] = []
                    try:
                        opening = await self._client.get_opening_odds(market_key)
                        for o in opening:
                            opening_rows.append(
                                self._flatten_outcome(o, market_flat))
                    except Exception:
                        logger.exception(
                            "Failed to fetch opening odds for market %s", market_key
                        )

                    # 3b. Closing odds
                    closing: list[dict] = []
                    try:
                        closing = await self._client.get_closing_odds(market_key)
                        for o in closing:
                            closing_rows.append(
                                self._flatten_outcome(o, market_flat))
                    except Exception:
                        logger.exception(
                            "Failed to fetch closing odds for market %s", market_key
                        )

                    # 3c. Historical outcomes (filtered by source)
                    try:
                        outcomes = await self._client.get_market_outcomes(
                            market_key, sources=settings.outcome_sources
                        )

                        # Impute timestamps using opening/closing interval
                        open_times = [
                            self._parse_iso(o.get("time", ""))
                            for o in opening
                        ]
                        close_times = [
                            self._parse_iso(o.get("time", ""))
                            for o in closing
                        ]
                        t_open = min(
                            (t for t in open_times if t), default=None
                        )
                        t_close = max(
                            (t for t in close_times if t), default=None
                        )
                        if t_open and t_close and t_open < t_close:
                            outcomes = self._impute_timestamps(
                                outcomes, t_open, t_close
                            )

                        for o in outcomes:
                            outcome_rows.append(
                                self._flatten_outcome(o, market_flat))
                    except Exception:
                        logger.exception(
                            "Failed to fetch outcomes for market %s", market_key
                        )

                # Mark event as done
                completed_events.add(event_key)
                self._save_checkpoint(competition, season, completed_events)

        except (KeyboardInterrupt, asyncio.CancelledError):
            interrupted = True
            logger.warning(
                "Interrupted! Flushing %d events, %d outcomes, %d opening, "
                "%d closing rows collected so far to Parquet…",
                len(event_rows),
                len(outcome_rows),
                len(opening_rows),
                len(closing_rows),
            )
        finally:
            # Write Parquet files on both normal exit and interrupt
            self._flush_parquet(
                competition, season,
                event_rows, outcome_rows, opening_rows, closing_rows,
            )

        if interrupted:
            logger.info(
                "Partial data saved. Re-run to resume from checkpoint.")
            return

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
