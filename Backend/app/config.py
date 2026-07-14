from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hackalytics API"
    app_version: str = "0.1.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 9000
    allowed_origins: list[str] = [
        "http://localhost:3000", "http://localhost:5173"]
    days_ahead: int = 60

    # URL of the ML model endpoint that returns prediction payloads.
    ml_model_url: str = ""

    # ML Pipeline settings
    ml_target_nodes: int = 150  # Target number of games to fetch for ML
    ml_request_delay_seconds: float = 0.0  # Delay between ML requests (for rate limiting)

    # ------------------------------------------------------------------
    # Arbitrage Middleware — PRD v3 Volume Optimization (§5)
    # ------------------------------------------------------------------
    # Confidence filter — markets below this are dropped
    min_confidence: float = 0.60

    bankroll: int = 100000             # Total capital pool (USD)
    kelly_fraction: float = 1.0         # Full Kelly — the risk model below does the damping
    bankroll_cap_pct: float = 0.10      # Max fraction of bankroll on any single market

    # Execution-risk model for the Kelly stake.
    # An arb only loses when the second leg fails to fill at the quoted price:
    #   with prob (1 - leg_failure_prob) both legs fill  → gain = margin × volume
    #   with prob leg_failure_prob the 2nd leg fails     → unwind leg 1 at the
    #     moved line, losing ~leg_failure_loss × volume
    leg_failure_prob: float = 0.05      # P(second leg doesn't fill at quoted odds)
    leg_failure_loss: float = 0.02      # Fraction of volume lost unwinding a failed leg

    # Drop market if guaranteed_profit < this (USD)
    min_profit_floor: int = 5

    # Line movement sensitivity (PRD §3 Step 2)
    # USD depth per 1.0 unit of implied probability movement.
    # Calibrated for a $100k bankroll on major US sportsbooks (DraftKings / FanDuel / ESPNBet).
    # On NBA/NFL tier-1 markets a $1k–$5k bet barely moves the line — books handle millions/day.
    # Lower if accounts get limited; lower trigger_threshold (e.g. 0.003) if lines move after bets.
    # Max additional IP movement allowed before "too moved"
    trigger_threshold: float = 0.005
    sensitivity_moneyline: int = 2_000_000  # NBA/NFL moneyline — most liquid
    sensitivity_spread: int = 1_500_000     # NBA/NFL spread — moderately liquid
    sensitivity_points_total: int = 1_000_000  # Totals — least liquid

    # profit_score normalisation ceiling (5% arb margin = score of 1.0)
    profit_cap: float = 0.05

    # Risk score inputs
    arb_risk_cap: float = 0.10          # Overround cap for arb validity risk
    exposure_cap: int = 200             # stake:profit ratio → market impact risk = 1.0

    # Risk-score weights — MUST sum to exactly 1.0 (validated at startup)
    weight_confidence: float = 0.40
    weight_arb_validity: float = 0.35
    weight_mkt_impact: float = 0.25

    # Sportsbook API (RapidAPI)
    rapidapi_key: str = ""
    rapidapi_host: str = "sportsbook-api.p.rapidapi.com"
    api_rate_limit_delay: float = 0.5  # seconds between requests

    # Outcome source filtering
    outcome_sources: list[str] = ["DRAFT_KINGS", "ESPN_BET", "FAN_DUEL"]

    # ------------------------------------------------------------------
    # Prediction markets (Polymarket + Kalshi) — both public, no API key
    # ------------------------------------------------------------------
    polymarket_gamma_url: str = "https://gamma-api.polymarket.com"
    kalshi_api_url: str = "https://external-api.kalshi.com/trade-api/v2"

    # Max markets to pull from each venue when scanning for arbitrage
    prediction_market_limit: int = 500

    # Minimum guaranteed margin (as a fraction, e.g. 0.01 = 1%) for an
    # arbitrage opportunity to be reported. Set to 0 to see every edge.
    prediction_arb_min_margin: float = 0.0

    # Title-similarity threshold (0-1) for matching a Polymarket market to a
    # Kalshi market when looking for cross-venue arbitrage.
    prediction_match_threshold: float = 0.60

    # Local model checkpoint — the trained TemporalArbitrageScorer weights.
    # Path is relative to the Backend/ directory.
    model_checkpoint_path: str = "models/model.ckpt"

    # Data output
    data_output_dir: str = "data/raw"

    # Supabase configuration
    supabase_url: str = ""
    supabase_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    def validate_risk_weights(self) -> None:
        total = round(self.weight_confidence +
                      self.weight_arb_validity + self.weight_mkt_impact, 10)
        if total != 1.0:
            raise ValueError(
                f"Risk score weights must sum to 1.0 — got {total}. "
                "Check WEIGHT_CONFIDENCE, WEIGHT_ARB_VALIDITY, WEIGHT_MKT_IMPACT."
            )


settings = Settings()
settings.validate_risk_weights()
