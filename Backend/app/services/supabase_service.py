"""Supabase service for storing arbitrage execution data."""
from supabase import create_client, Client
from app.config import settings


class SupabaseService:
    """Service for interacting with Supabase database."""

    def __init__(self):
        """Initialize Supabase client."""
        self.client: Client | None = None
        if settings.supabase_url and settings.supabase_key:
            self.client = create_client(settings.supabase_url, settings.supabase_key)

    def store_arbitrage_execution(self, node: dict) -> dict | None:
        """
        Store a single arbitrage execution node to Supabase.

        Args:
            node: Dict containing arbitrage execution data with keys:
                - category, home_team, away_team, date
                - market_type, profit_score, risk_score, confidence, volume
                - sportsbooks: list of dicts with 'name' and 'odds'

        Returns:
            The inserted record or None if client not configured
        """
        if not self.client:
            return None

        # Extract sportsbook data (expecting 2 sportsbooks)
        sportsbooks = node.get("sportsbooks", [])
        bookmaker_1 = sportsbooks[0].get("name", "") if len(sportsbooks) > 0 else ""
        odds_1 = sportsbooks[0].get("odds", "") if len(sportsbooks) > 0 else ""
        bookmaker_2 = sportsbooks[1].get("name", "") if len(sportsbooks) > 1 else ""
        odds_2 = sportsbooks[1].get("odds", "") if len(sportsbooks) > 1 else ""

        # Prepare data for insertion
        data = {
            "category": node.get("category", ""),
            "home_team": node.get("home_team", ""),
            "away_team": node.get("away_team", ""),
            "game_date": node.get("date", ""),
            "market_type": node.get("market_type", ""),
            "profit_score": node.get("profit_score", 0.0),
            "risk_score": node.get("risk_score", 0.0),
            "confidence": node.get("confidence", 0.0),
            "volume": node.get("volume", 0),
            "bookmaker_1": bookmaker_1,
            "odds_1": str(odds_1),
            "bookmaker_2": bookmaker_2,
            "odds_2": str(odds_2),
        }

        try:
            response = self.client.table("arbitrage_executions").insert(data).execute()
            return response.data[0] if response.data else None
        except Exception as e:
            print(f"Error storing arbitrage execution: {e}")
            return None

    def store_arbitrage_executions_bulk(self, nodes: list[dict]) -> list[dict]:
        """
        Store multiple arbitrage execution nodes to Supabase in bulk.

        Args:
            nodes: List of dicts containing arbitrage execution data

        Returns:
            List of inserted records or empty list if client not configured
        """
        if not self.client:
            return []

        # Prepare all data for bulk insertion
        data_list = []
        for node in nodes:
            sportsbooks = node.get("sportsbooks", [])
            bookmaker_1 = sportsbooks[0].get("name", "") if len(sportsbooks) > 0 else ""
            odds_1 = sportsbooks[0].get("odds", "") if len(sportsbooks) > 0 else ""
            bookmaker_2 = sportsbooks[1].get("name", "") if len(sportsbooks) > 1 else ""
            odds_2 = sportsbooks[1].get("odds", "") if len(sportsbooks) > 1 else ""

            data_list.append({
                "category": node.get("category", ""),
                "home_team": node.get("home_team", ""),
                "away_team": node.get("away_team", ""),
                "game_date": node.get("date", ""),
                "market_type": node.get("market_type", ""),
                "profit_score": node.get("profit_score", 0.0),
                "risk_score": node.get("risk_score", 0.0),
                "confidence": node.get("confidence", 0.0),
                "volume": node.get("volume", 0),
                "bookmaker_1": bookmaker_1,
                "odds_1": str(odds_1),
                "bookmaker_2": bookmaker_2,
                "odds_2": str(odds_2),
            })

        try:
            response = self.client.table("arbitrage_executions").insert(data_list).execute()
            return response.data if response.data else []
        except Exception as e:
            print(f"Error storing arbitrage executions in bulk: {e}")
            return []


# Singleton instance
supabase_service = SupabaseService()
