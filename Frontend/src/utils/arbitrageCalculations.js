/**
 * Arbitrage calculations based on Backend arbitrage_service.py
 */

const SETTINGS = {
  trigger_threshold: 0.05,
  sensitivity_moneyline: 50000,
  sensitivity_spread: 40000,
  sensitivity_points_total: 35000,
  kelly_fraction: 0.25,
  bankroll: 100000,
  bankroll_cap_pct: 0.15,
  profit_cap: 0.10,
  arb_risk_cap: 0.15,
  exposure_cap: 50,
  weight_confidence: 0.40,
  weight_arb_validity: 0.35,
  weight_mkt_impact: 0.25,
};

function impliedProb(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  }
  return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

function toDecimal(americanOdds) {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  }
  return (100 / Math.abs(americanOdds)) + 1;
}

function getSensitivity(marketType) {
  const map = {
    'moneyline': SETTINGS.sensitivity_moneyline,
    'spread': SETTINGS.sensitivity_spread,
    'over/under': SETTINGS.sensitivity_points_total,
  };
  return map[marketType?.toLowerCase()] || SETTINGS.sensitivity_moneyline;
}

/**
 * Step 1: Calculate line movement
 * Measures implied probability distance from open to current
 * Assumes no opening odds provided, so returns 0 (no movement)
 */
export function calculateLineMovement(sportsbooks, openOdds = null) {
  if (!sportsbooks || sportsbooks.length < 2) return 0;
  
  if (!openOdds) {
    return 0;
  }
  
  const move1 = Math.abs(impliedProb(sportsbooks[0].odds) - impliedProb(openOdds[0]));
  const move2 = Math.abs(impliedProb(sportsbooks[1].odds) - impliedProb(openOdds[1]));
  return Math.max(move1, move2);
}

/**
 * Step 2: Calculate market ceiling
 * Maximum stake before position detection
 */
export function calculateMarketCeiling(lineMovement, marketType) {
  const sensitivity = getSensitivity(marketType);
  const headroom = Math.max(SETTINGS.trigger_threshold - (lineMovement * 0.5), 0.001);
  return Math.round(headroom * sensitivity);
}

/**
 * Step 3: Calculate Kelly stake
 * Quarter-Kelly stake for two-sided arbitrage
 */
export function calculateKellyStake(sportsbooks) {
  if (!sportsbooks || sportsbooks.length < 2) return 0;
  
  const dec1 = toDecimal(sportsbooks[0].odds);
  const dec2 = toDecimal(sportsbooks[1].odds);
  
  const arbSum = (1 / dec1) + (1 / dec2);
  const arbMargin = 1 - arbSum;
  
  if (arbMargin <= 0) return 0;
  
  const bindingSide = Math.min(dec1, dec2);
  if ((bindingSide - 1) === 0) return 0;
  
  const fullKelly = arbMargin / (bindingSide - 1);
  return Math.round(fullKelly * SETTINGS.kelly_fraction * SETTINGS.bankroll);
}

/**
 * Step 4: Calculate final volume
 * MIN(kelly, ceiling, bankroll_cap)
 */
export function calculateFinalVolume(kellyStake, marketCeiling) {
  const bankrollCap = Math.round(SETTINGS.bankroll * SETTINGS.bankroll_cap_pct);
  
  if (kellyStake > 0) {
    return Math.min(kellyStake, marketCeiling, bankrollCap);
  }
  return 0;
}

/**
 * Calculate all arbitrage metrics for a node
 */
export function calculateArbitrageMetrics(nodeData) {
  const { sportsbooks, marketType } = nodeData;
  
  const lineMovement = calculateLineMovement(sportsbooks);
  const marketCeiling = calculateMarketCeiling(lineMovement, marketType);
  const kellyStake = calculateKellyStake(sportsbooks);
  const finalVolume = calculateFinalVolume(kellyStake, marketCeiling);
  
  return {
    lineMovement: (lineMovement * 100).toFixed(2) + '%',
    marketCeiling: '$' + marketCeiling.toLocaleString(),
    kellyStake: '$' + kellyStake.toLocaleString(),
    finalVolume: '$' + finalVolume.toLocaleString(),
  };
}

/**
 * SIMULATOR-SPECIFIC CALCULATIONS
 */

/**
 * Calculate expected profit for a given bet amount using backend arbitrage logic
 * Based on Backend/app/services/arbitrage_service.py lines 154-163
 * @param {number} betAmount - The total amount to bet
 * @param {Array} sportsbooks - Array of sportsbook objects with odds
 * @returns {number} Guaranteed profit in dollars
 */
export function calculateExpectedProfit(betAmount, sportsbooks) {
  if (!sportsbooks || sportsbooks.length < 2 || betAmount === 0) return 0;
  
  const dec1 = toDecimal(sportsbooks[0].odds);
  const dec2 = toDecimal(sportsbooks[1].odds);
  
  const arbSum = (1 / dec1) + (1 / dec2);
  
  if (arbSum === 0) return 0;
  
  // Proportional stake split (backend lines 154-159)
  const stake1 = Math.round(betAmount * (1 / dec1) / arbSum);
  const stake2 = Math.round(betAmount * (1 / dec2) / arbSum);
  
  // Calculate payouts (backend lines 161-162)
  const payout1 = stake1 * dec1;
  const payout2 = stake2 * dec2;
  
  // Guaranteed profit is minimum payout minus total stake (backend line 163)
  const guaranteedProfit = Math.round(Math.min(payout1, payout2) - betAmount);
  
  return guaranteedProfit;
}

/**
 * Calculate slippage risk based on bet size vs market ceiling
 * @param {number} betAmount - The amount to bet
 * @param {number} marketCeiling - Maximum stake before position detection
 * @returns {number} Slippage risk percentage (0-100)
 */
export function calculateSlippageRisk(betAmount, marketCeiling) {
  if (marketCeiling === 0) return 100;
  const ratio = betAmount / marketCeiling;
  return Math.min(ratio * 100, 100);
}

/**
 * Calculate optimal bet split between two sportsbooks
 * @param {number} betAmount - Total amount to bet
 * @param {Array} sportsbooks - Array of sportsbook objects with odds
 * @returns {Object} Split amounts and sportsbook names
 */
export function calculateBetSplit(betAmount, sportsbooks) {
  if (!sportsbooks || sportsbooks.length < 2) {
    return { book1: 0, book2: 0, book1Name: '', book2Name: '' };
  }
  
  const dec1 = toDecimal(sportsbooks[0].odds);
  const dec2 = toDecimal(sportsbooks[1].odds);
  
  const total = dec1 + dec2;
  const book1Amount = Math.round(betAmount * (dec2 / total));
  const book2Amount = betAmount - book1Amount;
  
  return {
    book1: book1Amount,
    book2: book2Amount,
    book1Name: sportsbooks[0].name,
    book2Name: sportsbooks[1].name,
  };
}
