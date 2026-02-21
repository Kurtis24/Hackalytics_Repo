// ─── Mock arbitrage node data ─────────────────────────────────────────────────
// Structured to match the ArbNode interface used by NodeRenderer.
// Replace this file with a real API call when the backend is ready.

// ── Named templates per cluster ───────────────────────────────────────────────
const SPORTS_EVENTS = [
  'NBA_LAL_BOS', 'NFL_KC_SF', 'MLB_NYY_BOS', 'NHL_TOR_MTL', 'EPL_MCI_MUN',
  'NBA_GSW_MIA', 'NFL_DAL_PHI', 'UFC_285_MAIN', 'NCAAB_DUKE_UNC', 'ATP_WIMBLEDON_QF',
  'NBA_BKN_CHI', 'NFL_GB_MIN', 'MLB_LAD_SF', 'NHL_BOS_TB', 'EPL_ARS_CHE',
  'NBA_PHX_DEN', 'NFL_BAL_CIN', 'UFC_290_CO', 'NCAAF_ALA_GA', 'WTA_ROLAND_QF',
];

const SPORTS_EXCHANGES = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'PointsBet', 'BetRivers'];

const QUANT_STRATEGIES = [
  'STAT_ARB_SPY_IVV', 'PAIRS_GS_JPM', 'DELTA_NEUTRAL_TSLA', 'CONVEX_BOND_10Y',
  'VOL_SKEW_SPX', 'ETF_BASKET_QQQ', 'MERGER_ARB_MSFT_ACT', 'CARRY_TRADE_JPY',
  'MEAN_REV_ES_NQ', 'BASIS_TRADE_TLT', 'DISPERSION_NDX', 'RISK_PARITY_60_40',
  'CTA_TREND_CL', 'FACTOR_MOM_SMALL', 'GAMMA_SCALP_AMZN', 'LEAD_LAG_SPY_SPX',
  'FIXED_INC_STRIP', 'CROSS_ASSET_CORR', 'VWAP_DRIFT_AAPL', 'IV_RV_SPREAD_VIX',
];

const QUANT_VENUES = ['CBOE', 'CME', 'NYSE', 'NASDAQ', 'BATS', 'IEX'];

const CRYPTO_PAIRS = [
  'BTC_USDT', 'ETH_USDT', 'SOL_USDT', 'BNB_USDT', 'ARB_USDT',
  'BTC_ETH',  'ETH_SOL',  'AVAX_USDT','MATIC_USDT','LINK_USDT',
  'BTC_USDC', 'ETH_USDC', 'SOL_BTC',  'DOT_USDT', 'ADA_USDT',
  'DOGE_USDT','LTC_USDT', 'UNI_USDT', 'AAVE_USDT','OP_USDT',
];

const CRYPTO_EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'dYdX', 'Uniswap'];

const MISC_EVENTS = [
  'FOREX_EUR_USD', 'FOREX_GBP_JPY', 'COMMOD_GOLD_SPOT', 'COMMOD_OIL_WTI',
  'ECON_CPI_RELEASE', 'ECON_FED_FOMC', 'IPO_LOCK_REDDIT', 'CONVERT_BOND_NVDA',
  'PRED_MARKET_ELEC', 'REAL_EST_REIT_ARB', 'CARBON_CREDIT_EU', 'WEATHER_DERIV_CME',
  'FX_CROSS_NOK_SEK', 'EM_BOND_BRAZIL', 'INFRA_TOLL_BOND', 'ART_NFT_INDEX',
];

// ── LCG for reproducible random data (seed-based) ─────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Builder helpers ───────────────────────────────────────────────────────────
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function buildSportsNode(i, rng) {
  const event    = pick(rng, SPORTS_EVENTS);
  const exchange = pick(rng, SPORTS_EXCHANGES);
  const alt      = pick(rng, SPORTS_EXCHANGES.filter(e => e !== exchange));
  return {
    node_id: `SPT_${event}_${i}`,
    cluster: 'sports',
    subcategory: event.split('_')[0], // NBA, NFL, MLB, etc.
    metrics: {
      event_count:    Math.floor(rng() * 180) + 2,
      profit_percent: rng() * 6 + 0.1,   // sports arb is small positive
      score:          rng(),
    },
    event_preview: [
      { event_type: 'moneyline', exchange,     price: +(1.5 + rng() * 2).toFixed(2) },
      { event_type: 'moneyline', exchange: alt, price: +(1.5 + rng() * 2).toFixed(2) },
    ],
  };
}

function buildQuantNode(i, rng) {
  const strategy = pick(rng, QUANT_STRATEGIES);
  const venue    = pick(rng, QUANT_VENUES);
  const profit   = (rng() - 0.2) * 8; // can be negative (loss)
  return {
    node_id: `QNT_${strategy}_${i}`,
    cluster: 'quant',
    subcategory: strategy.split('_')[0],
    metrics: {
      event_count:    Math.floor(rng() * 500) + 10,
      profit_percent: profit,
      score:          rng(),
    },
    event_preview: [
      { event_type: strategy, exchange: venue, price: +(rng() * 500 + 10).toFixed(4) },
    ],
  };
}

function buildCryptoNode(i, rng) {
  const pair     = pick(rng, CRYPTO_PAIRS);
  const exchange = pick(rng, CRYPTO_EXCHANGES);
  const alt      = pick(rng, CRYPTO_EXCHANGES.filter(e => e !== exchange));
  const profit   = rng() * 3 + 0.05; // crypto spreads can be juicy
  return {
    node_id: `CRY_${pair}_${i}`,
    cluster: 'crypto',
    subcategory: pair.split('_')[0], // BTC, ETH, SOL…
    metrics: {
      event_count:    Math.floor(rng() * 300) + 1,
      profit_percent: profit,
      score:          rng(),
    },
    event_preview: [
      { event_type: 'spot',  exchange,     price: +(rng() * 50000 + 100).toFixed(2) },
      { event_type: 'perp',  exchange: alt, price: +(rng() * 50000 + 100).toFixed(2) },
    ],
  };
}

function buildMiscNode(i, rng) {
  const event  = pick(rng, MISC_EVENTS);
  const profit = (rng() - 0.35) * 10;
  return {
    node_id: `MSC_${event}_${i}`,
    cluster: 'misc',
    subcategory: event.split('_')[0],
    metrics: {
      event_count:    Math.floor(rng() * 100) + 1,
      profit_percent: profit,
      score:          rng(),
    },
    event_preview: [
      { event_type: event, exchange: 'OTC', price: +(rng() * 1000).toFixed(4) },
    ],
  };
}

// ── Cross-cluster bridge nodes ─────────────────────────────────────────────────
// Must roughly match cluster centers in NodeRenderer.js
const MOCK_CENTERS = {
  sports: [-2000,  0,     0],
  quant:  [ 1400,  0,     0],
  crypto: [    0,  0,  1200],
  misc:   [    0,  0, -1000],
};

const BRIDGE_PAIRS = [
  {
    a: 'sports', b: 'misc',
    theme: 'PRED_MKT',
    exchanges: ['Kalshi', 'Polymarket', 'Betfair'],
  },
  {
    a: 'sports', b: 'crypto',
    theme: 'CRYPTO_SPORT',
    exchanges: ['Augur', 'SportX', 'Stake'],
  },
  {
    a: 'quant', b: 'crypto',
    theme: 'DEFI_QUANT',
    exchanges: ['dYdX', 'Aave', 'Vertex'],
  },
  {
    a: 'quant', b: 'misc',
    theme: 'MACRO_ARB',
    exchanges: ['ICE', 'EUREX', 'LME'],
  },
];

function buildBridgeNodes(startIdx, count, rng) {
  const nodes   = [];
  const perPair = Math.floor(count / BRIDGE_PAIRS.length);

  BRIDGE_PAIRS.forEach(({ a, b, theme, exchanges }) => {
    const [ax, , az] = MOCK_CENTERS[a];
    const [bx, , bz] = MOCK_CENTERS[b];
    const scatter    = 200;

    for (let j = 0; j < perPair; j++) {
      const t       = 0.2 + rng() * 0.6;
      const cluster = rng() < 0.5 ? a : b;
      nodes.push({
        node_id:     `BRG_${theme}_${startIdx++}`,
        cluster,
        subcategory: theme,
        position: {
          x: ax + (bx - ax) * t + (rng() - 0.5) * scatter,
          y: (rng() - 0.5) * scatter * 0.15,
          z: az + (bz - az) * t + (rng() - 0.5) * scatter,
        },
        metrics: {
          event_count:    Math.floor(rng() * 60) + 1,
          profit_percent: (rng() - 0.35) * 10,
          score:          rng(),
        },
        event_preview: [
          { event_type: theme, exchange: exchanges[Math.floor(rng() * exchanges.length)] },
        ],
      });
    }
  });

  return nodes;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generate `count` reproducible mock ArbNodes.
 * Uses a seeded RNG so the layout is stable across hot-reloads.
 *
 * @param {number} count
 * @returns {import('./NodeRenderer.js').ArbNode[]}
 */
export function generateMockNodes(count = 20000) {
  const rng   = lcg(0xdeadbeef);
  const nodes = [];

  // Distribute roughly evenly across clusters with slight variation
  const weights = { sports: 0.30, quant: 0.25, crypto: 0.30, misc: 0.15 };
  const builders = {
    sports: buildSportsNode,
    quant:  buildQuantNode,
    crypto: buildCryptoNode,
    misc:   buildMiscNode,
  };

  // Pre-allocate counts
  const clusterCounts = {};
  let remaining = count;
  const clusterList = Object.keys(weights);
  clusterList.forEach((cl, idx) => {
    const n = idx === clusterList.length - 1
      ? remaining
      : Math.round(count * weights[cl]);
    clusterCounts[cl] = n;
    remaining -= n;
  });

  // ~8% bridge nodes between cluster pairs
  const bridgeCount = Math.floor(count * 0.08);
  const mainCount   = count - bridgeCount;

  // Recompute cluster counts against mainCount
  let mainRemaining = mainCount;
  clusterList.forEach((cl, idx) => {
    const n = idx === clusterList.length - 1
      ? mainRemaining
      : Math.round(mainCount * weights[cl]);
    clusterCounts[cl] = n;
    mainRemaining -= n;
  });

  // Build main cluster nodes
  let i = 0;
  clusterList.forEach((cl) => {
    for (let j = 0; j < clusterCounts[cl]; j++) {
      nodes.push(builders[cl](i++, rng));
    }
  });

  // Append bridge nodes
  nodes.push(...buildBridgeNodes(i, bridgeCount, rng));

  // Fisher-Yates shuffle with seeded RNG for deterministic order
  for (let k = nodes.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [nodes[k], nodes[j]] = [nodes[j], nodes[k]];
  }

  return nodes;
}

/**
 * Generate edges between nodes that share the same underlying event
 * (same subcategory = same sport/asset/strategy type).
 * Each node connects to 2–4 peers in its subcategory bucket — these edges
 * represent the market events linking multiple arbitrage opportunities.
 *
 * @param {ReturnType<typeof generateMockNodes>} nodes
 * @returns {Array<{source: string, target: string}>}
 */
export function generateConnections(nodes) {
  const rng  = lcg(0xcafebabe);
  const seen = new Set();
  const connections = [];

  // Bucket nodes by subcategory (the underlying event type)
  const buckets = new Map();
  nodes.forEach((node) => {
    const key = node.subcategory ?? node.cluster;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node.node_id);
  });

  buckets.forEach((ids) => {
    if (ids.length < 2) return;
    ids.forEach((sourceId) => {
      // ~30% of nodes have no connections at all — keeps the graph sparse and organic
      if (rng() < 0.30) return;
      // Skewed distribution: most nodes get 1, occasionally 2 or 3
      const roll = rng();
      const numConns = roll < 0.55 ? 1 : roll < 0.85 ? 2 : 3;
      for (let k = 0; k < numConns; k++) {
        const targetId = ids[Math.floor(rng() * ids.length)];
        if (targetId === sourceId) continue;
        const edgeKey = sourceId < targetId
          ? `${sourceId}|${targetId}`
          : `${targetId}|${sourceId}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);
        connections.push({ source: sourceId, target: targetId });
      }
    });
  });

  return connections;
}
