from app.config import settings
from app.services.databricks_client import DatabricksServingClient

client = DatabricksServingClient(
    host=settings.databricks_host,
    client_id=settings.databricks_client_id,
    client_secret=settings.databricks_client_secret,
    endpoint_name=settings.databricks_serving_endpoint,
)
print('Querying discover_arbitrage...', flush=True)
result = client.query([{
    "features": [[2.30, 1.60, 7.00, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]],
    "mask": [False],
    "market_type": 1,
}])
print('Response:', result, flush=True)
