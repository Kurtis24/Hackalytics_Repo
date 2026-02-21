# Databricks notebook source
# MAGIC %md
# MAGIC # Sportsbook Data — Auto Loader (Bronze Ingestion)
# MAGIC
# MAGIC Reads new Parquet files from S3 using Auto Loader with file notifications
# MAGIC (SNS) and writes to Unity Catalog bronze tables.
# MAGIC
# MAGIC **Schedule:** Run ~30 min after ECS pipeline completes (daily).
# MAGIC Uses `trigger(availableNow=True)` — processes all new files then stops.

# COMMAND ----------

# Configuration — set via Databricks job parameters or widgets
dbutils.widgets.text("s3_bucket", "hackalytics-sportsbook-data-prod")
dbutils.widgets.text("catalog", "sportsbook")
dbutils.widgets.text("schema", "bronze")
dbutils.widgets.text("sns_topic_arn", "")
dbutils.widgets.text("checkpoint_base", "/Volumes/sportsbook/bronze/_checkpoints")

S3_BUCKET = dbutils.widgets.get("s3_bucket")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
SNS_TOPIC_ARN = dbutils.widgets.get("sns_topic_arn")
CHECKPOINT_BASE = dbutils.widgets.get("checkpoint_base")

S3_BASE = f"s3://{S3_BUCKET}/raw"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema Definitions

# COMMAND ----------

from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    DoubleType,
    BooleanType,
)

events_schema = StructType([
    StructField("event_key", StringType(), True),
    StructField("event_name", StringType(), True),
    StructField("event_start_time", StringType(), True),
    StructField("home_participant_key", StringType(), True),
    StructField("away_participant_key", StringType(), True),
    StructField("home_participant_name", StringType(), True),
    StructField("away_participant_name", StringType(), True),
    StructField("competition_instance_name", StringType(), True),
    StructField("competition_instance_start", StringType(), True),
    StructField("competition_instance_end", StringType(), True),
])

odds_schema = StructType([
    StructField("event_key", StringType(), True),
    StructField("event_name", StringType(), True),
    StructField("event_start_time", StringType(), True),
    StructField("home_participant_key", StringType(), True),
    StructField("away_participant_key", StringType(), True),
    StructField("home_participant_name", StringType(), True),
    StructField("away_participant_name", StringType(), True),
    StructField("competition_instance_name", StringType(), True),
    StructField("competition_instance_start", StringType(), True),
    StructField("competition_instance_end", StringType(), True),
    StructField("market_key", StringType(), True),
    StructField("market_type", StringType(), True),
    StructField("market_segment", StringType(), True),
    StructField("market_participant_key", StringType(), True),
    StructField("outcome_key", StringType(), True),
    StructField("modifier", StringType(), True),
    StructField("payout", DoubleType(), True),
    StructField("outcome_type", StringType(), True),
    StructField("live", BooleanType(), True),
    StructField("read_at", StringType(), True),
    StructField("last_found_at", StringType(), True),
    StructField("source", StringType(), True),
    StructField("participant_key", StringType(), True),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Auto Loader Helper

# COMMAND ----------

def run_autoloader(table_name: str, s3_path: str, schema: StructType) -> None:
    """Run an Auto Loader stream for a single table using availableNow trigger."""
    target_table = f"{CATALOG}.{SCHEMA}.{table_name}"
    checkpoint = f"{CHECKPOINT_BASE}/{table_name}"

    reader = (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "parquet")
        .option("cloudFiles.schemaLocation", checkpoint)
        .option("cloudFiles.useNotifications", "true")
        .option("cloudFiles.region", "us-east-1")
    )

    if SNS_TOPIC_ARN:
        reader = reader.option("cloudFiles.snsTopic", SNS_TOPIC_ARN)

    df = (
        reader
        .schema(schema)
        .load(s3_path)
        .withColumn("_ingested_at", F.current_timestamp())
        .withColumn("_source_file", F.input_file_name())
    )

    (
        df.writeStream
        .format("delta")
        .option("checkpointLocation", checkpoint)
        .option("mergeSchema", "true")
        .trigger(availableNow=True)
        .toTable(target_table)
    )

    print(f"Auto Loader completed for {target_table}")

# COMMAND ----------

from pyspark.sql import functions as F

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Schema (if needed)

# COMMAND ----------

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Run All 4 Streams

# COMMAND ----------

run_autoloader(
    table_name="events",
    s3_path=f"{S3_BASE}/events/",
    schema=events_schema,
)

# COMMAND ----------

run_autoloader(
    table_name="outcomes",
    s3_path=f"{S3_BASE}/outcomes/",
    schema=odds_schema,
)

# COMMAND ----------

run_autoloader(
    table_name="opening_odds",
    s3_path=f"{S3_BASE}/opening_odds/",
    schema=odds_schema,
)

# COMMAND ----------

run_autoloader(
    table_name="closing_odds",
    s3_path=f"{S3_BASE}/closing_odds/",
    schema=odds_schema,
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify Row Counts

# COMMAND ----------

for table in ["events", "outcomes", "opening_odds", "closing_odds"]:
    count = spark.table(f"{CATALOG}.{SCHEMA}.{table}").count()
    print(f"{CATALOG}.{SCHEMA}.{table}: {count:,} rows")
