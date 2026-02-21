"""
AWS Lambda handler: retries failed Sportsbook API calls from the SQS
dead-letter queue and writes recovered data to S3.

Triggered every 6 hours by EventBridge. Reads up to 10 messages per
invocation. After 3 failed receives, SQS moves messages to the poison
queue automatically (configured via redrive policy).
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import os

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

from Backend.app.services.data_pipeline import DataCollectionPipeline
from Backend.app.services.sportsbook_client import SportsbookAPIClient

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

S3_BUCKET = os.environ.get("S3_BUCKET", "hackalytics-sportsbook-data")
S3_PREFIX = os.environ.get("S3_PREFIX", "raw")
SQS_DLQ_URL = os.environ["SQS_DLQ_URL"]
RAPIDAPI_KEY = os.environ["RAPIDAPI_KEY"]
RAPIDAPI_HOST = os.environ.get("RAPIDAPI_HOST", "sportsbook-api2.p.rapidapi.com")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

s3 = boto3.client("s3", region_name=AWS_REGION)
sqs = boto3.client("sqs", region_name=AWS_REGION)

# Map call_type to the client method name
_CALL_MAP = {
    "outcomes": "get_market_outcomes",
    "opening": "get_opening_odds",
    "closing": "get_closing_odds",
}

# Map call_type to the S3 table directory
_TABLE_MAP = {
    "outcomes": "outcomes",
    "opening": "opening_odds",
    "closing": "closing_odds",
}


async def _retry_single(msg_body: dict) -> list[dict]:
    """Re-execute a single failed API call and return flattened rows."""
    market_key = msg_body["market_key"]
    call_type = msg_body["call_type"]
    market_flat = msg_body["market_flat"]

    method_name = _CALL_MAP.get(call_type)
    if not method_name:
        raise ValueError(f"Unknown call_type: {call_type}")

    async with SportsbookAPIClient(
        rapidapi_key=RAPIDAPI_KEY,
        rapidapi_host=RAPIDAPI_HOST,
        rate_limit_delay=0.5,
    ) as client:
        method = getattr(client, method_name)
        raw = await method(market_key)

    # Flatten results using the same logic as the pipeline
    rows = []
    items = raw if isinstance(raw, list) else [raw]
    for item in items:
        rows.append(DataCollectionPipeline._flatten_outcome(item, market_flat))

    return rows


def _write_to_s3(rows: list[dict], call_type: str, competition: str, season: str) -> str:
    """Write recovered rows to S3 and return the key."""
    table = pa.Table.from_pylist(rows)
    buf = io.BytesIO()
    pq.write_table(table, buf)
    buf.seek(0)

    table_name = _TABLE_MAP[call_type]
    ts = DataCollectionPipeline._make_timestamp()
    key = f"{S3_PREFIX}/{table_name}/sport={competition}/season={season}/{table_name}_recovered_{ts}.parquet"

    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=buf.getvalue(),
        ContentType="application/octet-stream",
    )
    return key


def handler(event: dict, context: object) -> dict:
    """Lambda entry point. Reads SQS DLQ messages and retries failed calls."""
    messages = sqs.receive_message(
        QueueUrl=SQS_DLQ_URL,
        MaxNumberOfMessages=10,
        WaitTimeSeconds=5,
        VisibilityTimeout=120,
    ).get("Messages", [])

    if not messages:
        logger.info("No messages in DLQ")
        return {"processed": 0, "recovered": 0, "failed": 0}

    logger.info("Processing %d DLQ messages", len(messages))
    recovered = 0
    failed = 0

    for msg in messages:
        receipt_handle = msg["ReceiptHandle"]
        try:
            body = json.loads(msg["Body"])
            market_key = body["market_key"]
            call_type = body["call_type"]
            competition = body["competition"]
            season = body["season"]

            logger.info("Retrying %s for market %s (%s)", call_type, market_key, competition)

            rows = asyncio.get_event_loop().run_until_complete(
                _retry_single(body)
            )

            if rows:
                s3_key = _write_to_s3(rows, call_type, competition, season)
                logger.info("Recovered %d rows → s3://%s/%s", len(rows), S3_BUCKET, s3_key)

            sqs.delete_message(QueueUrl=SQS_DLQ_URL, ReceiptHandle=receipt_handle)
            recovered += 1

        except Exception:
            logger.exception("Retry failed for message %s", msg.get("MessageId", "?"))
            failed += 1

    result = {"processed": len(messages), "recovered": recovered, "failed": failed}
    logger.info("DLQ retry complete: %s", result)
    return result
