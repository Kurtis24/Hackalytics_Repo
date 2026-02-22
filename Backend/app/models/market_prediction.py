from pydantic import BaseModel


class MarketPrediction(BaseModel):
    market_type: str       # "spread" | "points_total" | "moneyline"
    confidence: float      # Raw sigmoid 0-1
    bookmaker_1: str
    bookmaker_2: str
    price_1: int           # American odds
    price_2: int           # American odds
    prediction: str        # e.g. "home -3.5", "over 220.5", "away win"


class GamePredictionResponse(BaseModel):
    game_id: str

    category: str          # basketball | baseball | hockey | american_football

    home_team: str
    away_team: str
    start_time: str        # ISO 8601
    markets: list[MarketPrediction]


class AllGamesPredictionResponse(BaseModel):
    games: list[GamePredictionResponse]
