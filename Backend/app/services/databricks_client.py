"""
Client for Databricks Model Serving endpoints.

Authenticates via OAuth M2M (service principal) and queries the
``discover_arbitrage`` serving endpoint.
"""

from __future__ import annotations

import logging

from databricks.sdk import WorkspaceClient
from databricks.sdk.config import Config

logger = logging.getLogger(__name__)


class DatabricksServingClient:
    """Thin wrapper around a Databricks model serving endpoint."""

    def __init__(
        self,
        host: str,
        client_id: str,
        client_secret: str,
        endpoint_name: str = "discover_arbitrage",
    ) -> None:
        self._endpoint_name = endpoint_name
        self._ws = WorkspaceClient(
            config=Config(
                host=host,
                client_id=client_id,
                client_secret=client_secret,
            )
        )

    def query(self, dataframe_records: list[dict]) -> dict:
        """Send a prediction request to the serving endpoint.

        Args:
            dataframe_records: A list of row dicts matching the model's
                input schema. Each dict is one observation.

        Returns:
            The raw JSON response from the serving endpoint.
        """
        response = self._ws.serving_endpoints.query(
            name=self._endpoint_name,
            dataframe_records=dataframe_records,
        )
        return response.as_dict()

    def query_split(
        self,
        columns: list[str],
        data: list[list],
    ) -> dict:
        """Send a prediction request using the split-oriented format.

        Args:
            columns: Column names matching the model's input schema.
            data: Row-major matrix of values (one inner list per row).

        Returns:
            The raw JSON response from the serving endpoint.
        """
        response = self._ws.serving_endpoints.query(
            name=self._endpoint_name,
            dataframe_split={"columns": columns, "data": data},
        )
        return response.as_dict()
