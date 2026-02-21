from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hackalytics API"
    app_version: str = "0.1.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000
    allowed_origins: list[str] = [
        "http://localhost:3000", "http://localhost:5173"]

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
        env_file=("Backend/.env", ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
print(settings)
