"""
Arbitrage runner — fetches a prediction payload from the ML model endpoint
(same logic as the API) and prints scored results to the terminal.

Usage:
    cd Backend
    venv/bin/python run_arbitrage.py

Set ML_MODEL_URL in .env to point at your model server.
If not set, the built-in sample payload is used.
"""

import asyncio
from app.services.ml_service import fetch_prediction
from app.models.arbitrage import PredictionInput
from app.services.arbitrage_service import process_prediction
from app.services.analysis_service import analyze

RISK_ROWS = [
    (0.00, 0.25, "🟢 Low     "),
    (0.25, 0.50, "🟡 Moderate"),
    (0.50, 0.75, "🟠 Elevated"),
    (0.75, 1.01, "🔴 High    "),
]

def risk_label(score: float) -> str:
    for lo, hi, label in RISK_ROWS:
        if lo <= score < hi:
            return label
    return "Unknown"


async def main():
    raw          = await fetch_prediction()
    prediction   = PredictionInput(**raw)
    opportunities = process_prediction(prediction)
    analysis      = analyze(opportunities)

    print("=" * 62)
    print(f"  {prediction.home_team}  vs  {prediction.away_team}")
    print(f"  {prediction.category.upper()}  |  {prediction.date}")
    print("=" * 62)

    if not opportunities:
        print("  No markets passed the confidence threshold.")
    else:
        for i, o in enumerate(opportunities, 1):
            tag = "TRUE ARB ✓" if o.profit_score > 0 else "value bet"
            print(f"\n  [{i}] {o.market_type.upper()}  ({tag})")
            print(f"      Confidence     : {o.confidence:.0%}")
            print(f"      Profit Score   : {o.profit_score:.4f}")
            print(f"      Risk Score     : {o.risk_score:.4f}  {risk_label(o.risk_score)}")
            print(f"      Total Stake    : ${o.total_stake:,}")
            print(f"      Guaranteed P&L : ${o.guaranteed_profit:,}")
            for sb in o.sportsbooks:
                sign = "+" if sb.odds > 0 else ""
                print(f"        {sb.name:<14}  odds {sign}{sb.odds:<6}  stake ${sb.stake:,}")

    print("\n" + "-" * 62)
    a = analysis
    print("  PORTFOLIO SUMMARY")
    print("-" * 62)
    print(f"  Opportunities    : {a.total_opportunities}  ({a.confirmed_arbs} arbs · {a.value_bets} value bets)")
    print(f"  Capital required : ${a.total_capital_required:,}")
    print(f"  Expected profit  : ${a.expected_total_profit:,}")
    print(f"  Avg profit score : {a.avg_profit_score:.4f}")
    print(f"  Avg risk score   : {a.avg_risk_score:.4f}")
    print(f"  Risk distribution:")
    rd = a.risk_distribution
    print(f"    🟢 Low       {rd.low}")
    print(f"    🟡 Moderate  {rd.moderate}")
    print(f"    🟠 Elevated  {rd.elevated}")
    print(f"    🔴 High      {rd.high}")
    if a.best_opportunity:
        b = a.best_opportunity
        print(f"\n  Best opportunity : {b.market_type.upper()} "
              f"— profit {b.profit_score:.4f}  risk {b.risk_score:.4f}")
    print("=" * 62)


if __name__ == "__main__":
    asyncio.run(main())
