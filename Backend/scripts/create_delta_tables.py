"""
Create Delta Lake tables for the Hackalytics arbitrage detection project.

Creates two tables in the default catalog/schema:
  - upcoming_games: future game events
  - game_odds: historical game odds (opening and closing)

Usage (run on Databricks):
    %run ./scripts/create_delta_tables

Or from a notebook cell:
    exec(open("scripts/create_delta_tables.py").read())
"""

from pyspark.sql import SparkSession
from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    DoubleType,
    BooleanType,
    TimestampType,
)


def get_spark() -> SparkSession:
    return SparkSession.builder.getOrCreate()


# ── Schemas ──────────────────────────────────────────────────────────────────

UPCOMING_GAMES_SCHEMA = StructType([
    StructField("event_key", StringType(), True),
    StructField("event_name", StringType(), True),
    StructField("event_start_time", TimestampType(), True),
    StructField("home_participant_key", StringType(), True),
    StructField("away_participant_key", StringType(), True),
    StructField("home_participant_name", StringType(), True),
    StructField("away_participant_name", StringType(), True),
    StructField("competition_instance_name", StringType(), True),
    StructField("competition_instance_start", TimestampType(), True),
    StructField("competition_instance_end", TimestampType(), True),
    StructField("sport", StringType(), True),
    StructField("season", StringType(), True),
])

GAME_ODDS_SCHEMA = StructType([
    StructField("event_key", StringType(), True),
    StructField("event_name", StringType(), True),
    StructField("event_start_time", TimestampType(), True),
    StructField("home_participant_key", StringType(), True),
    StructField("away_participant_key", StringType(), True),
    StructField("home_participant_name", StringType(), True),
    StructField("away_participant_name", StringType(), True),
    StructField("competition_instance_name", StringType(), True),
    StructField("competition_instance_start", TimestampType(), True),
    StructField("competition_instance_end", TimestampType(), True),
    StructField("market_key", StringType(), True),
    StructField("market_type", StringType(), True),
    StructField("market_segment", StringType(), True),
    StructField("market_participant_key", StringType(), True),
    StructField("outcome_key", StringType(), True),
    StructField("modifier", DoubleType(), True),
    StructField("payout", DoubleType(), True),
    StructField("outcome_type", StringType(), True),
    StructField("live", BooleanType(), True),
    StructField("read_at", TimestampType(), True),
    StructField("last_found_at", TimestampType(), True),
    StructField("source", StringType(), True),
    StructField("participant_key", StringType(), True),
    StructField("odds_type", StringType(), True),
    StructField("sport", StringType(), True),
    StructField("season", StringType(), True),
])


# ── Table creation ───────────────────────────────────────────────────────────

SCHEMA = "default"


def _full_name(table: str) -> str:
    return f"{SCHEMA}.{table}"


def create_upcoming_games(spark: SparkSession) -> None:
    """Create the upcoming_games Delta table if it does not exist."""
    table = _full_name("upcoming_games")
    spark.sql("""
        CREATE TABLE IF NOT EXISTS default.upcoming_games (
            event_key               STRING,
            event_name              STRING,
            event_start_time        TIMESTAMP,
            home_participant_key    STRING,
            away_participant_key    STRING,
            home_participant_name   STRING,
            away_participant_name   STRING,
            competition_instance_name  STRING,
            competition_instance_start TIMESTAMP,
            competition_instance_end   TIMESTAMP,
            sport                   STRING,
            season                  STRING
        )
        COMMENT 'Future game events imported from parquet volume storage'
    """)
    print(f"Table {table} is ready.")


def create_game_odds(spark: SparkSession) -> None:
    """Create the game_odds Delta table if it does not exist."""
    table = _full_name("game_odds")
    spark.sql("""
        CREATE TABLE IF NOT EXISTS default.game_odds (
            event_key               STRING,
            event_name              STRING,
            event_start_time        TIMESTAMP,
            home_participant_key    STRING,
            away_participant_key    STRING,
            home_participant_name   STRING,
            away_participant_name   STRING,
            competition_instance_name  STRING,
            competition_instance_start TIMESTAMP,
            competition_instance_end   TIMESTAMP,
            market_key              STRING,
            market_type             STRING,
            market_segment          STRING,
            market_participant_key  STRING,
            outcome_key             STRING,
            modifier                DOUBLE,
            payout                  DOUBLE,
            outcome_type            STRING,
            live                    BOOLEAN,
            read_at                 TIMESTAMP,
            last_found_at           TIMESTAMP,
            source                  STRING,
            participant_key         STRING,
            odds_type               STRING,
            sport                   STRING,
            season                  STRING
        )
        COMMENT 'Historical opening and closing game odds imported from parquet volume storage'
    """)
    print(f"Table {table} is ready.")


def create_all_tables() -> None:
    """Create all Delta tables needed by the arbitrage detection pipeline."""
    spark = get_spark()
    create_upcoming_games(spark)
    create_game_odds(spark)
    print("All tables created successfully.")


if __name__ == "__main__":
    create_all_tables()
