from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Input — Prediction Model → Middleware  (PRD §2.1)
# ---------------------------------------------------------------------------

class MarketInput(BaseModel):
    market_type: str        # "spread" | "points_total" | "moneyline"
    confidence: float       # 0.0 – 1.0
    bookmaker_1: str        # Sportsbook name — side A
    bookmaker_2: str        # Sportsbook name — side B
    price_1: int            # American odds at bookmaker_1
    price_2: int            # American odds at bookmaker_2 (opposing side)
    prediction: str         # Human-readable model label (internal only)


class PredictionInput(BaseModel):
    category: str           # Sport e.g. "basketball"
    date: str               # ISO 8601 game start
    home_team: str
    away_team: str
    markets: list[MarketInput]

    @field_validator("date")
    @classmethod
    def date_must_be_present(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("date is required")
        return v


# ---------------------------------------------------------------------------
# Output — Middleware → Frontend  (PRD §2.2)
# ---------------------------------------------------------------------------

class SportsbookEntry(BaseModel):
    name: str
    odds: int
    stake: int


class ArbitrageOpportunity(BaseModel):
    category: str
    date: str
    home_team: str
    away_team: str
    market_type: str
    confidence: float
    profit_score: float         # 0-1 normalised arb margin quality
    risk_score: float           # 0-1 composite risk (0 = lowest)
    stake_book1: int            # USD to place at bookmaker_1
    stake_book2: int            # USD to place at bookmaker_2
    total_stake: int            # stake_book1 + stake_book2
    guaranteed_profit: int      # USD profit regardless of outcome (0 if no arb)
    sportsbooks: list[SportsbookEntry]


# ---------------------------------------------------------------------------
# Analysis output  (analysis_service)
# ---------------------------------------------------------------------------

class RiskDistribution(BaseModel):
    low: int        # risk_score 0.00 – 0.25
    moderate: int   # risk_score 0.25 – 0.50
    elevated: int   # risk_score 0.50 – 0.75
    high: int       # risk_score 0.75 – 1.00


class PortfolioAnalysis(BaseModel):
    total_opportunities: int
    confirmed_arbs: int             # profit_score > 0
    value_bets: int                 # profit_score == 0 (confidence-driven)
    total_capital_required: int     # sum of all total_stake
    expected_total_profit: int      # sum of all guaranteed_profit
    avg_profit_score: float
    avg_risk_score: float
    risk_distribution: RiskDistribution
    best_opportunity: ArbitrageOpportunity | None   # highest profit_score, lowest risk
    ranked_opportunities: list[ArbitrageOpportunity]  # profit_score ↓, risk_score ↑
