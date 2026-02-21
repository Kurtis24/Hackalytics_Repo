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

    # ------------------------------------------------------------------
    # Arbitrage Middleware — all values from PRD section 7
    # ------------------------------------------------------------------
    min_confidence: float = 0.60       # Markets below this are silently dropped
    bankroll: int = 100_000            # Operator's total capital pool (USD)
    kelly_fraction: float = 0.25       # Quarter Kelly — see PRD §4.3
    max_total_stake: int = 10_000      # Hard cap per market (USD)
    profit_cap: float = 0.05           # 5 % arb margin = profit_score 1.0
    arb_risk_cap: float = 0.10         # Overround cap for arb validity risk
    exposure_cap: int = 200            # stake:profit ratio → market impact risk = 1.0

    # URL of the ML model endpoint that returns prediction payloads.
    # Set ML_MODEL_URL in .env to point at your real model server.
    ml_model_url: str = ""

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
    databricks_host: str = "https://dbc-68e9cc4f-b99c.cloud.databricks.com"
    databricks_client_id: str = ""
    databricks_client_secret: str = ""
    databricks_serving_endpoint: str = "discover_arbitrage"

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
