"""
Analysis Service

Takes a list of ArbitrageOpportunity objects (already computed by
arbitrage_service) and produces portfolio-level insights:

  - Capital exposure and expected profit totals
  - Risk distribution across the four PRD risk buckets
  - Opportunity ranking by profit quality vs risk
  - Confirmed arb count vs confidence-driven value-bet count
"""

import logging

from app.models.arbitrage import (
    ArbitrageOpportunity,
    PortfolioAnalysis,
    RiskDistribution,
)

logger = logging.getLogger(__name__)

# Risk bucket boundaries (PRD §5.5)
_LOW_MAX      = 0.25
_MODERATE_MAX = 0.50
_ELEVATED_MAX = 0.75


def _risk_bucket(risk_score: float) -> str:
    if risk_score <= _LOW_MAX:
        return "low"
    if risk_score <= _MODERATE_MAX:
        return "moderate"
    if risk_score <= _ELEVATED_MAX:
        return "elevated"
    return "high"


def _rank(opportunities: list[ArbitrageOpportunity]) -> list[ArbitrageOpportunity]:
    """
    Sort opportunities by descending profit_score, then ascending risk_score.
    Best opportunity = highest quality arb with the least risk.
    """
    return sorted(opportunities, key=lambda o: (-o.profit_score, o.risk_score))


def analyze(opportunities: list[ArbitrageOpportunity]) -> PortfolioAnalysis:
    """
    Produce a PortfolioAnalysis summary over any list of ArbitrageOpportunity objects.
    Handles empty input gracefully.
    """
    if not opportunities:
        return PortfolioAnalysis(
            total_opportunities=0,
            confirmed_arbs=0,
            value_bets=0,
            total_capital_required=0,
            expected_total_profit=0,
            avg_profit_score=0.0,
            avg_risk_score=0.0,
            risk_distribution=RiskDistribution(low=0, moderate=0, elevated=0, high=0),
            best_opportunity=None,
            ranked_opportunities=[],
        )

    ranked = _rank(opportunities)

    # Tallies
    confirmed_arbs = sum(1 for o in opportunities if o.profit_score > 0)
    value_bets     = len(opportunities) - confirmed_arbs

    total_capital  = sum(o.total_stake       for o in opportunities)
    total_profit   = sum(o.guaranteed_profit for o in opportunities)

    avg_profit_score = round(sum(o.profit_score for o in opportunities) / len(opportunities), 4)
    avg_risk_score   = round(sum(o.risk_score   for o in opportunities) / len(opportunities), 4)

    # Risk distribution
    buckets: dict[str, int] = {"low": 0, "moderate": 0, "elevated": 0, "high": 0}
    for o in opportunities:
        buckets[_risk_bucket(o.risk_score)] += 1

    logger.info(
        "Portfolio analysis: %d opportunities | %d arbs | %d value bets | "
        "$%d capital | $%d expected profit",
        len(opportunities), confirmed_arbs, value_bets, total_capital, total_profit,
    )

    return PortfolioAnalysis(
        total_opportunities=len(opportunities),
        confirmed_arbs=confirmed_arbs,
        value_bets=value_bets,
        total_capital_required=total_capital,
        expected_total_profit=total_profit,
        avg_profit_score=avg_profit_score,
        avg_risk_score=avg_risk_score,
        risk_distribution=RiskDistribution(**buckets),
        best_opportunity=ranked[0] if ranked else None,
        ranked_opportunities=ranked,
    )
