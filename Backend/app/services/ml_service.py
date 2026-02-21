"""
ML Model Service

POSTs to the configured ML_MODEL_URL to fetch a prediction payload.
Falls back to the built-in sample if the URL is not set, so the API
always returns something useful in development.
"""

import logging
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SAMPLE_PAYLOAD = {
    "category": "basketball",
    "date": "2023-01-10T20:00:00Z",
    "home_team": "Houston Rockets",
    "away_team": "New York Knicks",
    "markets": [
        {
            "market_type": "spread",
            "confidence": 0.65,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": 140,
            "price_2": 135,
            "prediction": "home_team wins by 6",
        },
        {
            "market_type": "points_total",
            "confidence": 0.61,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "FanDuel",
            "price_1": -110,
            "price_2": -105,
            "prediction": "home_team scores over 110",
        },
        {
            "market_type": "moneyline",
            "confidence": 0.72,
            "bookmaker_1": "DraftKings",
            "bookmaker_2": "ESPNBet",
            "price_1": -120,
            "price_2": 115,
            "prediction": "home_team wins",
        },
    ],
}


async def fetch_prediction() -> dict:
    """
    POST to ML_MODEL_URL and return the prediction payload dict.
    Falls back to SAMPLE_PAYLOAD if ML_MODEL_URL is not configured or unreachable.
    """
    url = settings.ml_model_url.strip()

    if not url:
        logger.info("ML_MODEL_URL not set — returning sample payload.")
        return SAMPLE_PAYLOAD

    logger.info("Fetching prediction from ML model: %s", url)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={})
            resp.raise_for_status()
            data = resp.json()
            logger.info("Received payload (%d markets).", len(data.get("markets", [])))
            return data
    except httpx.HTTPStatusError as e:
        logger.error("HTTP %s from ML model — falling back to sample.", e.response.status_code)
        return SAMPLE_PAYLOAD
    except Exception as e:
        logger.error("Could not reach ML model (%s) — falling back to sample.", e)
        return SAMPLE_PAYLOAD
