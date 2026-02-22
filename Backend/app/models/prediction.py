from typing import Optional

from pydantic import BaseModel, model_validator


class PredictionRequest(BaseModel):
    category: str                          # e.g. "basketball"
    date: str                              # ISO 8601 game start
    live: int                              # 0 = pre-game, 1 = in-play
    home_team: str
    away_team: str
    market_type: Optional[str] = None      # required when live=1
    value: float                           # line / total value
    current_odds: dict[str, list[float]]   # bookmaker → list of probabilities

    @model_validator(mode="after")
    def require_market_type_for_live(self):
        if self.live == 1 and not self.market_type:
            raise ValueError("market_type is required when live=1")
        return self


class PredictionResponse(BaseModel):
    request: PredictionRequest
    historical_games_found: int
    model_prediction: dict
