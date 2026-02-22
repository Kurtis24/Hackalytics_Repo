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
    kelly_fraction: float = 0.25        # Quarter Kelly for stealth + resilience
    bankroll_cap_pct: float = 0.10      # Max fraction of bankroll on any single market

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

    # Databricks Model Serving (OAuth M2M)
    databricks_host: str = "https://dbc-249c9c95-e52b.cloud.databricks.com"
    databricks_client_id: str = ""
    databricks_client_secret: str = ""
    databricks_serving_endpoint: str = "discover_arbitrage"
    databricks_warehouse_id: str = ""

    # Delta Lake table references
    delta_games_table: str = "workspace.default.upcoming_games"
    delta_odds_table: str = "workspace.default.game_odds"

    # Local model checkpoint (used when Databricks endpoint is unavailable)
    model_checkpoint_path: str = "models/model.ckpt"

    # Model execution mode: "local" | "remote" | "auto"
    #   local  — local checkpoint inference only
    #   remote — Databricks serving endpoint only (fails if unreachable)
    #   auto   — try remote, fall back to local on error
    model_execution_mode: str = "local"


    # Data output
    data_output_dir: str = "data/raw"

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

print(settings)
