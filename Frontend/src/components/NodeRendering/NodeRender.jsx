import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './SceneManager.js';
import mockNodes from '../../data/mockNodes.js';
import { adaptNodesForScene, generateConnections } from '../../utils/dataAdapter.js';

export default function NodeRender() {
  const canvasRef  = useRef(null);
  const managerRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  // ── Search state ────────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [liveOnly,   setLiveOnly]   = useState(false);
  const [minProfit,  setMinProfit]  = useState('');
  const [maxProfit,  setMaxProfit]  = useState('');
  const [minConf,    setMinConf]    = useState('');
  const [maxConf,    setMaxConf]    = useState('');
  const [minRisk,    setMinRisk]    = useState('');
  const [maxRisk,    setMaxRisk]    = useState('');
  const [minVolume,  setMinVolume]  = useState('');
  const [maxVolume,  setMaxVolume]  = useState('');
  const [sport,      setSport]      = useState('');
  const [homeTeam,   setHomeTeam]   = useState('');
  const [awayTeam,   setAwayTeam]   = useState('');
  const [marketType, setMarketType] = useState('');
  const [sportsbook, setSportsbook] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [resultInfo, setResultInfo] = useState(null);
  
  // ── UI toggle state ─────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  // ── Scene setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const manager     = new SceneManager(canvas);
      managerRef.current = manager;
      const nodes       = adaptNodesForScene(mockNodes);
      const connections = generateConnections(nodes);
      manager.loadNodes(nodes, connections);
      manager.start();
      setReady(true);
    } catch (err) {
      console.error('[NodeRender]', err);
      setError(err.message ?? String(err));
    }
    return () => { managerRef.current?.dispose(); managerRef.current = null; };
  }, []);

  // ── Search handlers ─────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const manager = managerRef.current;
    if (!manager) return;

    const criteria = {};
    if (searchText.trim()) criteria.text      = searchText.trim();
    if (liveOnly)          criteria.live      = true;
    if (minProfit !== '')  criteria.minProfit = +minProfit;
    if (maxProfit !== '')  criteria.maxProfit = +maxProfit;
    if (minConf   !== '')  criteria.minConf   = +minConf;
    if (maxConf   !== '')  criteria.maxConf   = +maxConf;
    if (minRisk   !== '')  criteria.minRisk   = +minRisk;
    if (maxRisk   !== '')  criteria.maxRisk   = +maxRisk;
    if (minVolume !== '')  criteria.minVolume = +minVolume;
    if (maxVolume !== '')  criteria.maxVolume = +maxVolume;
    if (sport.trim())      criteria.sport     = sport.trim();
    if (homeTeam.trim())   criteria.homeTeam  = homeTeam.trim();
    if (awayTeam.trim())   criteria.awayTeam  = awayTeam.trim();
    if (marketType.trim()) criteria.marketType = marketType.trim();
    if (sportsbook.trim()) criteria.sportsbook = sportsbook.trim();
    if (dateFrom.trim())   criteria.dateFrom  = dateFrom.trim();
    if (dateTo.trim())     criteria.dateTo    = dateTo.trim();

    if (!Object.keys(criteria).length) return;

    const indices = manager.nodeRenderer.search(criteria);
    const count   = manager.applySearch(indices);
    setResultInfo({ count });
  }, [searchText, liveOnly, minProfit, maxProfit, minConf, maxConf, minRisk, maxRisk, 
      minVolume, maxVolume, sport, homeTeam, awayTeam, marketType, sportsbook, dateFrom, dateTo]);

  const handleClear = useCallback(() => {
    managerRef.current?.clearSearch();
    setResultInfo(null);
    setSearchText(''); setLiveOnly(false);
    setMinProfit(''); setMaxProfit('');
    setMinConf('');   setMaxConf('');
    setMinRisk('');   setMaxRisk('');
    setMinVolume(''); setMaxVolume('');
    setSport('');     setHomeTeam('');
    setAwayTeam('');  setMarketType('');
    setSportsbook(''); setDateFrom(''); setDateTo('');
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  // ── Preset filters ──────────────────────────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    handleClear();
    
    setTimeout(() => {
      const manager = managerRef.current;
      if (!manager) return;
      
      const criteria = {};
      if (preset === 'high-risk') {
        setMinProfit('5');
        setMaxProfit('10');
        setMinRisk('0.6');
        setMinVolume('200000');
        criteria.minProfit = 5;
        criteria.maxProfit = 10;
        criteria.minRisk = 0.6;
        criteria.minVolume = 200000;
      } else if (preset === 'safe') {
        setMinProfit('0.5');
        setMaxRisk('0.35');
        setMinConf('0.7');
        setMinVolume('100000');
        criteria.minProfit = 0.5;
        criteria.maxRisk = 0.35;
        criteria.minConf = 0.7;
        criteria.minVolume = 100000;
      } else if (preset === 'live') {
        setLiveOnly(true);
        setMinProfit('0.5');
        criteria.live = true;
        criteria.minProfit = 0.5;
      }
      
      const indices = manager.nodeRenderer.search(criteria);
      const count = manager.applySearch(indices);
      setResultInfo({ count });
    }, 50);
  }, [handleClear]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4, color: '#e8e8f0', fontSize: 11, fontFamily: 'monospace',
    padding: '4px 7px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const halfInput = { ...inputStyle, width: '50%' };
  const label     = { color: '#888', fontSize: 10, marginBottom: -2 };

  const btn = (primary) => ({
    background:   primary ? 'rgba(57,255,20,0.15)' : 'rgba(255,255,255,0.05)',
    border:       primary ? '1px solid rgba(57,255,20,0.40)' : '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4, color: primary ? '#39ff14' : '#999',
    fontSize: 11, fontFamily: 'monospace', padding: '5px 0', cursor: 'pointer', flex: 1,
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.03);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.25);
        }
      `}</style>

      {/* Error overlay */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a14', color: '#ff6b6b',
          fontFamily: 'monospace', fontSize: 13, padding: 32, zIndex: 10,
          whiteSpace: 'pre-wrap', textAlign: 'center',
        }}>
          ⚠ NodeRender error:{'\n'}{error}
        </div>
      )}

      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* ── Search panel ────────────────────────────────────────────────────── */}
      {ready && (
        <div style={{
          position: 'absolute', top: 16, right: 16, width: 230, maxHeight: 'calc(100vh - 32px)',
          background: 'rgba(8,8,20,0.90)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, fontFamily: 'monospace', fontSize: 11,
          color: '#ccc', zIndex: 10, display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box',
        }}>
          {/* Header with toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', borderBottom: showSearch ? '1px solid rgba(255,255,255,0.10)' : 'none',
          }}>
            <div style={{ color: '#fff', fontWeight: 'bold' }}>Search Filters</div>
            <button
              onClick={() => setShowSearch(!showSearch)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4,
                color: '#999',
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '4px 8px',
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              {showSearch ? '✕ Hide' : '▼ Show'}
            </button>
          </div>

          {/* Collapsible content */}
          {showSearch && (
            <div style={{
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
            className="custom-scrollbar"
            >

          {/* Preset tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <button
              onClick={() => applyPreset('high-risk')}
              style={{
                flex: 1,
                background: 'rgba(255,107,107,0.15)',
                border: '1px solid rgba(255,107,107,0.40)',
                borderRadius: 4,
                color: '#ff6b6b',
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '6px 4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              High Risk
            </button>
            <button
              onClick={() => applyPreset('safe')}
              style={{
                flex: 1,
                background: 'rgba(57,255,20,0.15)',
                border: '1px solid rgba(57,255,20,0.40)',
                borderRadius: 4,
                color: '#39ff14',
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '6px 4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Safe Bets
            </button>
            <button
              onClick={() => applyPreset('live')}
              style={{
                flex: 1,
                background: 'rgba(255,51,51,0.15)',
                border: '1px solid rgba(255,51,51,0.40)',
                borderRadius: 4,
                color: '#ff3333',
                fontSize: 10,
                fontFamily: 'monospace',
                padding: '6px 4px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Live Now
            </button>
          </div>

          {/* Text */}
          <input style={inputStyle} placeholder="node ID substring…"
            value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={onKeyDown} />

          {/* Live toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            <input type="checkbox" checked={liveOnly}
              onChange={e => setLiveOnly(e.target.checked)}
              style={{ accentColor: '#ff3333', cursor: 'pointer' }} />
            <span style={{ color: liveOnly ? '#ff3333' : '#aaa' }}>Live only</span>
          </label>

          {/* Sport */}
          <div style={label}>Sport</div>
          <select style={inputStyle} value={sport} onChange={e => setSport(e.target.value)}>
            <option value="">All sports</option>
            <option value="baseball">Baseball</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="hockey">Hockey</option>
          </select>

          {/* Home Team */}
          <div style={label}>Home Team</div>
          <input style={inputStyle} placeholder="team name…"
            value={homeTeam} onChange={e => setHomeTeam(e.target.value)} onKeyDown={onKeyDown} />

          {/* Away Team */}
          <div style={label}>Away Team</div>
          <input style={inputStyle} placeholder="team name…"
            value={awayTeam} onChange={e => setAwayTeam(e.target.value)} onKeyDown={onKeyDown} />

          {/* Market Type */}
          <div style={label}>Market Type</div>
          <select style={inputStyle} value={marketType} onChange={e => setMarketType(e.target.value)}>
            <option value="">All types</option>
            <option value="spread">Spread</option>
            <option value="moneyline">Moneyline</option>
            <option value="over/under">Over/Under</option>
          </select>

          {/* Sportsbook */}
          <div style={label}>Sportsbook</div>
          <input style={inputStyle} placeholder="sportsbook name…"
            value={sportsbook} onChange={e => setSportsbook(e.target.value)} onKeyDown={onKeyDown} />

          {/* Profit */}
          <div style={label}>Profit %</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={halfInput} type="number" placeholder="min"
              value={minProfit} onChange={e => setMinProfit(e.target.value)} onKeyDown={onKeyDown} />
            <input style={halfInput} type="number" placeholder="max"
              value={maxProfit} onChange={e => setMaxProfit(e.target.value)} onKeyDown={onKeyDown} />
          </div>

          {/* Confidence */}
          <div style={label}>Confidence [0–1]</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={halfInput} type="number" step="0.01" placeholder="min"
              value={minConf} onChange={e => setMinConf(e.target.value)} onKeyDown={onKeyDown} />
            <input style={halfInput} type="number" step="0.01" placeholder="max"
              value={maxConf} onChange={e => setMaxConf(e.target.value)} onKeyDown={onKeyDown} />
          </div>

          {/* Risk */}
          <div style={label}>Risk [0–1]</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={halfInput} type="number" step="0.01" placeholder="min"
              value={minRisk} onChange={e => setMinRisk(e.target.value)} onKeyDown={onKeyDown} />
            <input style={halfInput} type="number" step="0.01" placeholder="max"
              value={maxRisk} onChange={e => setMaxRisk(e.target.value)} onKeyDown={onKeyDown} />
          </div>

          {/* Volume */}
          <div style={label}>Volume ($)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={halfInput} type="number" placeholder="min"
              value={minVolume} onChange={e => setMinVolume(e.target.value)} onKeyDown={onKeyDown} />
            <input style={halfInput} type="number" placeholder="max"
              value={maxVolume} onChange={e => setMaxVolume(e.target.value)} onKeyDown={onKeyDown} />
          </div>

          {/* Date Range */}
          <div style={label}>Date Range</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input style={inputStyle} type="date"
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <input style={inputStyle} type="date"
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn(true)}  onClick={handleSearch}>Search</button>
            <button style={btn(false)} onClick={handleClear}>Clear</button>
          </div>

          {/* Result count */}
          {resultInfo !== null && (
            <div style={{
              color: resultInfo.count > 0 ? '#39ff14' : '#ff6b6b',
              fontSize: 10, textAlign: 'center', marginTop: -2,
            }}>
              {resultInfo.count === 0
                ? 'No matches'
                : resultInfo.count === 1
                  ? '1 node — focused'
                  : `${resultInfo.count.toLocaleString()} nodes glowing`}
            </div>
          )}

          {/* Show All Nodes button */}
          {resultInfo !== null && (
            <button
              onClick={handleClear}
              style={{
                background: 'rgba(57,255,20,0.15)',
                border: '1px solid rgba(57,255,20,0.40)',
                borderRadius: 6,
                color: '#39ff14',
                fontSize: 12,
                fontFamily: 'monospace',
                fontWeight: 'bold',
                padding: '10px 0',
                cursor: 'pointer',
                width: '100%',
                marginTop: 4,
              }}
            >
              Show All Nodes
            </button>
          )}
            </div>
          )}
        </div>
      )}

      {/* ── Legend toggle button ──────────────────────────────────────────────── */}
      {ready && (
        <button
          onClick={() => setShowLegend(!showLegend)}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 11,
            background: 'rgba(8,8,20,0.90)',
            border: '1px solid rgba(255,255,255,0.20)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            padding: '10px 16px',
            cursor: 'pointer',
            pointerEvents: 'auto',
          }}
        >
          {showLegend ? '✕ Hide Legend' : 'ℹ Legend'}
        </button>
      )}

      {/* ── Legend / axis key ───────────────────────────────────────────────── */}
      {ready && showLegend && (
        <div style={{
          position: 'absolute', top: 60, left: 16,
          background: 'rgba(8,8,20,0.82)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11,
          color: '#ccc', lineHeight: 1.9, pointerEvents: 'none',
        }}>
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>Axes</div>
          {[
            { label: 'X  Confidence →', color: '#ffffff' },
            { label: 'Y  Profit →',     color: '#ffffff' },
            { label: 'Z  Risk →',       color: '#ffffff' },
          ].map(({ label: l, color }) => (
            <div key={l} style={{ color }}>{l}</div>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 8, paddingTop: 8 }}>
            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>Color</div>
            {[
              { color: '#ff7043', label: 'Baseball' },
              { color: '#42a5f5', label: 'Football' },
              { color: '#ffca28', label: 'Basketball' },
              { color: '#26c6da', label: 'Hockey' },
            ].map(({ color, label: l }) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10,
                  background: color, borderRadius: '50%', flexShrink: 0,
                }} />
                {l}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                border: '1.5px solid #ff0000', flexShrink: 0,
              }} />
              Live
            </div>
            <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
              Size = volume · Hover to inspect · Click to focus
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
