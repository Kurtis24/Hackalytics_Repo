#!/usr/bin/env python3
"""
Diagnostic script to check Supabase database connection and data.
Run this to verify if the arbitrage_executions table has data.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.supabase_service import supabase_service


def main():
    print("=" * 60)
    print("SUPABASE DATABASE DIAGNOSTICS")
    print("=" * 60)

    # Check if client is configured
    if not supabase_service.client:
        print("❌ ERROR: Supabase client not configured!")
        print("   Please check your .env file has:")
        print("   - SUPABASE_URL")
        print("   - SUPABASE_KEY")
        return

    print("✅ Supabase client configured")
    print()

    # Try to fetch records
    print("Fetching records from arbitrage_executions table...")
    try:
        records = supabase_service.get_arbitrage_executions(limit=10)
        print(f"✅ Successfully fetched {len(records)} records")
        print()

        if len(records) == 0:
            print("⚠️  WARNING: Table is EMPTY!")
            print("   The database has no arbitrage executions.")
            print()
            print("   To populate data:")
            print("   1. Run the CRON job (wait until 1st of month)")
            print("   2. OR manually trigger: POST /api/v1/arbitrage/execute")
            print("   3. OR run: curl -X POST http://localhost:9000/api/v1/arbitrage/execute")
            print()
        else:
            print("Sample records:")
            print("-" * 60)
            for i, record in enumerate(records[:3], 1):
                print(f"\nRecord {i}:")
                print(f"  Category: {record.get('category')}")
                print(f"  Teams: {record.get('home_team')} vs {record.get('away_team')}")
                print(f"  Market: {record.get('market_type')}")
                print(f"  Date: {record.get('game_date')}")
                print(f"  Profit Score: {record.get('profit_score')}")
                print(f"  Confidence: {record.get('confidence')}")
                print(f"  Bookmakers: {record.get('bookmaker_1')} ({record.get('odds_1')}) vs {record.get('bookmaker_2')} ({record.get('odds_2')})")

    except Exception as e:
        print(f"❌ ERROR fetching records: {e}")
        print()
        print("Possible issues:")
        print("  1. Table 'arbitrage_executions' doesn't exist in Supabase")
        print("  2. Supabase credentials are incorrect")
        print("  3. Network connectivity issues")
        return

    print()
    print("=" * 60)
    print("DIAGNOSTICS COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
