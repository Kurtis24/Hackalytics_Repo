from pydantic import BaseModel


class Game(BaseModel):
    category: str
    live: int = 0
    home_team: str
    away_team: str
    start_time: str  # ISO 8601 UTC string
