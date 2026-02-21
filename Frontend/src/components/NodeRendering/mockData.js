// ─── Mock arbitrage node data ─────────────────────────────────────────────────
// Schema: { node_id, live, metrics: { confidence, profit, risk, volume } }
//
// confidence ∈ [0, 1]   → X axis
// profit     (float %)  → Y axis  (can be negative)
// risk       ∈ [0, 1]   → Z axis
// volume     (dollar)   → node size
// live       (bool)     → red highlight

// ── LCG for reproducible layout ───────────────────────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// ── Matchups per sport ────────────────────────────────────────────────────────
const MATCHUPS = {
  baseball: [
    'NYY_BOS', 'LAD_SF',  'CHC_STL', 'ATL_NYM', 'HOU_TEX',
    'TOR_BAL', 'MIN_CLE', 'SD_ARI',  'PHI_MIL', 'DET_CWS',
    'SEA_OAK', 'TB_MIA',  'CIN_PIT', 'COL_LAA', 'KC_WSH',
  ],
  football: [
    'KC_BUF',  'DAL_PHI', 'SF_LAR',  'MIA_NE',  'BAL_CIN',
    'DEN_LV',  'GB_MIN',  'SEA_ARI', 'NO_TB',   'NYG_WSH',
    'IND_TEN', 'CHI_DET', 'ATL_CAR', 'HOU_JAX', 'PIT_CLE',
  ],
  basketball: [
    'LAL_GSW', 'BOS_MIL', 'PHX_DEN', 'BKN_NYK', 'MIA_ORL',
    'CHI_IND', 'DAL_SAS', 'LAC_SAC', 'POR_UTA', 'MEM_NOP',
    'ATL_CHA', 'WAS_TOR', 'MIN_OKC', 'CLE_DET', 'HOU_PHI',
  ],
  hockey: [
    'EDM_CGY', 'TOR_MTL', 'BOS_NYR', 'COL_VGK', 'TB_FLA',
    'PIT_WSH', 'STL_CHI', 'DAL_MIN', 'ANA_LA',  'SEA_VAN',
    'SJS_ARI', 'NJD_PHI', 'CBJ_BUF', 'DET_OTT', 'NSH_CAR',
  ],
};

const EXCHANGES = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'PointsBet', 'Bet365', 'BetRivers'];

const TYPE_PREFIX = {
  baseball: 'BSB', football: 'AFB', basketball: 'BBL', hockey: 'HKY',
};

// ── Equal weight across four sports ───────────────────────────────────────────
const SPORTS = ['baseball', 'football', 'basketball', 'hockey'];
function pickSport(rng) { return SPORTS[Math.floor(rng() * 4)]; }

// ── Distribution parameters per sport ─────────────────────────────────────────
// Sports arb: small-to-moderate profit, moderate-to-high risk, small volume
// confidence is tighter (human events are uncertain)
const PARAMS = {
  //              conf range         profit range       risk range         volume ($)
  baseball:   { cL:0.40, cH:0.82,  pL:0.10, pH:5.5,  rL:0.35, rH:0.80,  vL:500,  vH:30000 },
  football:   { cL:0.38, cH:0.85,  pL:0.15, pH:7.0,  rL:0.30, rH:0.82,  vL:800,  vH:50000 },
  basketball: { cL:0.42, cH:0.88,  pL:0.10, pH:5.0,  rL:0.28, rH:0.75,  vL:600,  vH:40000 },
  hockey:     { cL:0.35, cH:0.80,  pL:0.20, pH:6.5,  rL:0.38, rH:0.85,  vL:400,  vH:25000 },
};

function buildNode(i, rng) {
  const sport  = pickSport(rng);
  const p      = PARAMS[sport];
  const matchup = pick(rng, MATCHUPS[sport]);
  const exch    = pick(rng, EXCHANGES);

  const confidence = Math.min(0.99, Math.max(0.01, p.cL + rng() * (p.cH - p.cL)));
  const risk       = Math.min(0.99, Math.max(0.01, p.rL + rng() * (p.rH - p.rL)));

  // 8% chance of negative profit (expired / line already moved)
  const rawProfit = p.pL + rng() * (p.pH - p.pL);
  const profit    = rng() < 0.08 ? -(rng() * 2.5) : rawProfit;

  // Volume: log-uniform within range
  const volume = p.vL * Math.pow(p.vH / p.vL, rng());

  // ~8% live
  const live = rng() < 0.08;

  return {
    node_id: `${TYPE_PREFIX[sport]}_${matchup}_${exch.replace(/\s/g,'')}_${i}`,
    live,
    metrics: { confidence, profit, risk, volume },
  };
}

// ── Public generators ─────────────────────────────────────────────────────────
export function generateMockNodes(n = 1000) {
  const rng   = lcg(0xdeadbeef);
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push(buildNode(i, rng));
  return nodes;
}

export function generateConnections(nodes) {
  // Sparse: 30% skip, max 3 connections per node
  const rng   = lcg(0xcafebabe);
  const conns = [];
  const n     = nodes.length;
  for (let i = 0; i < n; i++) {
    if (rng() < 0.30) continue;
    const r      = rng();
    const degree = r < 0.55 ? 1 : r < 0.85 ? 2 : 3;
    for (let d = 0; d < degree; d++) {
      const j = Math.floor(rng() * n);
      if (j !== i) conns.push({ source: nodes[i].node_id, target: nodes[j].node_id });
    }
  }
  return conns;
}
