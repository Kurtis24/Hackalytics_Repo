from fastapi import APIRouter, HTTPException

from app.models.arbitrage import ArbitrageOpportunity, PortfolioAnalysis, PredictionInput
from app.services.ml_service import fetch_prediction, fetch_all_predictions
from app.services.arbitrage_service import process_prediction, implied_prob, to_decimal
from app.services.analysis_service import analyze
from app.config import settings

router = APIRouter(prefix="/arbitrage", tags=["Arbitrage"])


def _market_to_node(market: dict, game: dict) -> dict:
    """Convert a single market + game context into a node dict for the frontend.

    Computes profit_score and risk_score from the raw odds so every market
    is represented — not just those that pass the arb profit floor.
    """
    price_1 = market["price_1"]
    price_2 = market["price_2"]
    confidence = market.get("confidence", 0.0)

    dec1 = to_decimal(price_1)
    dec2 = to_decimal(price_2)
    arb_sum = (1 / dec1) + (1 / dec2)
    arb_margin = 1 - arb_sum  # > 0 means true arb

    # profit_score: normalised arb margin (0-1), 0 if no arb edge
    profit_score = round(min(max(arb_margin, 0) / settings.profit_cap, 1.0), 4)

    # risk_score: weighted composite (same formula as arbitrage_service)
    confidence_risk = 1 - confidence
    total_implied = implied_prob(price_1) + implied_prob(price_2)
    arb_validity_risk = 0.0 if total_implied < 1.0 else min((total_implied - 1.0) / settings.arb_risk_cap, 1.0)
    market_impact_risk = 1.0  # no volume → worst-case

    risk_score = round(
        settings.weight_confidence * confidence_risk
        + settings.weight_arb_validity * arb_validity_risk
        + settings.weight_mkt_impact * market_impact_risk,
        4,
    )

    return {
        "category": game.get("category", ""),
        "home_team": game.get("home_team", ""),
        "away_team": game.get("away_team", ""),
        "profit_score": profit_score,
        "risk_score": risk_score,
        "confidence": round(confidence, 4),
        "volume": 0,
        "date": game.get("date", ""),
        "market_type": market.get("market_type", ""),
        "sportsbooks": [
            {"name": market.get("bookmaker_1", ""), "odds": price_1},
            {"name": market.get("bookmaker_2", ""), "odds": price_2},
        ],
    }


@router.post("/execute")
async def execute_pipeline() -> list[dict]:
    """
    Full Execute Backend pipeline:
      1. Fetch games + odds → run local ML model (waits for completion)
      2. Score every market and return ALL as nodes (no profit-floor filtering)
      3. Return a flat list of node dicts for the frontend to graph
    """
    try:
        prediction_payloads = await fetch_all_predictions()

        all_nodes: list[dict] = []
        for raw in prediction_payloads:
            game_ctx = {
                "category": raw.get("category", ""),
                "home_team": raw.get("home_team", ""),
                "away_team": raw.get("away_team", ""),
                "date": raw.get("date", ""),
            }
            for market in raw.get("markets", []):
                try:
                    all_nodes.append(_market_to_node(market, game_ctx))
                except Exception:
                    continue

        return all_nodes
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/opportunities", response_model=list[ArbitrageOpportunity])
async def get_opportunities() -> list[ArbitrageOpportunity]:
    """
    Fetches the latest prediction from the ML model internally,
    runs it through the arbitrage pipeline, and returns all
    qualifying opportunities scored and filtered.
    """
    try:
        raw = await fetch_prediction()
        payload = PredictionInput(**raw)
        return process_prediction(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/analysis", response_model=PortfolioAnalysis)
async def get_analysis() -> PortfolioAnalysis:
    """
    Fetches the latest prediction from the ML model internally,
    runs it through the arbitrage pipeline, and returns a full
    portfolio analysis (risk distribution, capital totals, rankings).
    """
    try:
        raw = await fetch_prediction()
        payload = PredictionInput(**raw)
        opportunities = process_prediction(payload)
        return analyze(opportunities)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
