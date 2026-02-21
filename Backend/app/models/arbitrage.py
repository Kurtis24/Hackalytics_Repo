from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Input — Prediction Model → Middleware  (PRD v3 §6)
# ---------------------------------------------------------------------------

class MarketInput(BaseModel):
    market_type: str        # "spread" | "points_total" | "moneyline"
    confidence: float       # 0.0 – 1.0
    bookmaker_1: str        # Sportsbook name — side A
    bookmaker_2: str        # Sportsbook name — side B
    price_1: int            # Current American odds at bookmaker_1
    price_2: int            # Current American odds at bookmaker_2 (opposing side)
    open_price_1: int | None = None   # Opening odds at bookmaker_1 (NEW — PRD v3 §2)
    open_price_2: int | None = None   # Opening odds at bookmaker_2 (NEW — PRD v3 §2)
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
# Output — Middleware → Frontend  (PRD v3 §7)
# ---------------------------------------------------------------------------

class SportsbookEntry(BaseModel):
    name: str
    odds: int
    stake: int


class ArbitrageOpportunity(BaseModel):
    # Game context (pass-through)
    category: str
    date: str
    home_team: str
    away_team: str
    market_type: str
    confidence: float

    # Scores
    profit_score: float         # 0-1 normalised arb margin quality
    risk_score: float           # 0-1 composite risk (0 = lowest)

    # Volume — optimal stakes (PRD v3 §7)
    optimal_volume: int         # Total stake across both books (Kelly & ceiling constrained)
    stake_book1: int            # USD to place at bookmaker_1
    stake_book2: int            # USD to place at bookmaker_2
    guaranteed_profit: int      # USD profit guaranteed regardless of outcome

    # Diagnostic fields — show which constraint was binding (PRD v3 §7)
    line_movement: float        # Measured IP movement from open to current
    market_ceiling: int         # Estimated max stake before market detects position
    kelly_stake: int            # Kelly-optimal stake before ceiling constraint

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
    value_bets: int                 # profit_score == 0 (below floor, shouldn't reach here)
    total_capital_required: int     # sum of all optimal_volume
    expected_total_profit: int      # sum of all guaranteed_profit
    avg_profit_score: float
    avg_risk_score: float
    risk_distribution: RiskDistribution
    best_opportunity: ArbitrageOpportunity | None
    ranked_opportunities: list[ArbitrageOpportunity]  # profit_score ↓, risk_score ↑
