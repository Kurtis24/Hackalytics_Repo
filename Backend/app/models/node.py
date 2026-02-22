"""Node model for ML pipeline output (Databricks) and bulk node storage."""

from pydantic import BaseModel, Field, model_validator


class SportsbookEntry(BaseModel):
    name: str
    odds: int


class Node(BaseModel):
    """Single node (arbitrage opportunity) from ML / Databricks output."""

    category: str
    home_team: str
    away_team: str
    profit_score: float = 0.0
    risk_score: float = 0.0
    confidence: float = 0.0
    volume: int = 0
    date: str = ""  # ISO date or datetime; frontend may send "Date"
    market_type: str = ""
    sportsbooks: list[SportsbookEntry] = Field(default_factory=list)

    model_config = {"populate_by_name": True, "extra": "allow"}

    @model_validator(mode="before")
    @classmethod
    def accept_date_alias(cls, data: dict) -> dict:
        if isinstance(data, dict) and "Date" in data and not data.get("date"):
            data = {**data, "date": data["Date"]}
        return data
