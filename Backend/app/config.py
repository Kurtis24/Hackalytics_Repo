from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Hackalytics API"
    app_version: str = "0.1.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 9000
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]
    # How many calendar days ahead to scan for upcoming regular-season games.
    # 60 days covers the full tail of any major league's regular season from any point.
    days_ahead: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
