import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './SceneManager.js';
import { useData } from '../../context/DataContext.jsx';
import { adaptNodesForScene, generateConnections } from '../../utils/dataAdapter.js';

export default function NodeRender({ onNodeSelect }) {
  const canvasRef  = useRef(null);
  const managerRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const { getNodes, dataMode } = useData();

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
  const [activePreset, setActivePreset] = useState(null);

  // ── Scene setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const manager     = new SceneManager(canvas, onNodeSelect);
      managerRef.current = manager;
      const sourceData  = getNodes();
      const nodes       = adaptNodesForScene(sourceData);
      const connections = generateConnections(nodes);
      manager.loadNodes(nodes, connections);
      manager.start();
      setReady(true);
    } catch (err) {
      console.error('[NodeRender]', err);
      setError(err.message ?? String(err));
    }
    return () => { managerRef.current?.dispose(); managerRef.current = null; };
  }, [getNodes, onNodeSelect]);

  // ── Reload scene when data changes ──────────────────────────────────────────
  useEffect(() => {
    if (!ready || !managerRef.current) return;
    try {
      const sourceData  = getNodes();
      console.log('[NodeRender] Reloading scene with source data:', sourceData);
      console.log('[NodeRender] Data mode:', dataMode);

      const nodes       = adaptNodesForScene(sourceData);
      console.log('[NodeRender] Adapted nodes for scene:', nodes);
      console.log('[NodeRender] Total nodes for scene:', nodes.length);

      const connections = generateConnections(nodes);
      console.log('[NodeRender] Generated connections:', connections.length);

      managerRef.current.loadNodes(nodes, connections);
      console.log('[NodeRender] Nodes loaded into 3D scene');
    } catch (err) {
      console.error('[NodeRender] reload error:', err);
      setError(err.message ?? String(err));
    }
  }, [dataMode, ready, getNodes]);

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
    setActivePreset(null);
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  // ── Preset filters ──────────────────────────────────────────────────────────
  const applyPreset = useCallback((preset) => {
    if (activePreset === preset) {
      handleClear();
      setActivePreset(null);
      return;
    }
    
    handleClear();
    setActivePreset(preset);
    
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
  }, [handleClear, activePreset]);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const PF = { fontFamily: "'Playfair Display', Georgia, serif" };
  
  const inputStyle = {
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4, color: '#e8e8f0', fontSize: 11, ...PF,
    padding: '4px 7px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  
  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    backgroundImage: 'linear-gradient(45deg, transparent 50%, #e8e8f0 50%), linear-gradient(135deg, #e8e8f0 50%, transparent 50%)',
    backgroundPosition: 'calc(100% - 12px) calc(1em - 2px), calc(100% - 7px) calc(1em - 2px)',
    backgroundSize: '5px 5px, 5px 5px',
    backgroundRepeat: 'no-repeat',
    paddingRight: '24px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  };
  const halfInput = { ...inputStyle, width: '50%' };
  const label     = { color: '#888', fontSize: 10, marginBottom: -2, ...PF };

  const btn = (primary) => ({
    background:   primary ? 'rgba(57,255,20,0.15)' : 'rgba(255,255,255,0.05)',
    border:       primary ? '1px solid rgba(57,255,20,0.40)' : '1px solid rgba(255,255,255,0.10)',
    borderRadius: 4, color: primary ? '#39ff14' : '#999',
    fontSize: 11, ...PF, padding: '5px 0', cursor: 'pointer', flex: 1,
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
        
        select option {
          background: #1a1a2e;
          color: #e8e8f0;
          padding: 8px;
        }
        
        select option:hover {
          background: #2a2a3e;
        }
      `}</style>

      {/* Error overlay */}
      {error && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a14', color: '#ff6b6b',
          ...PF, fontSize: 13, padding: 32, zIndex: 10,
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
          borderRadius: 8, ...PF, fontSize: 11,
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
                ...PF,
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
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button
              onClick={() => applyPreset('high-risk')}
              style={{
                flex: 1,
                background: activePreset === 'high-risk' ? 'rgba(255,107,107,0.30)' : 'rgba(255,107,107,0.10)',
                border: activePreset === 'high-risk' ? '2px solid rgba(255,107,107,0.70)' : '1px solid rgba(255,107,107,0.30)',
                borderRadius: 6,
                color: activePreset === 'high-risk' ? '#ff6b6b' : '#ff9999',
                fontSize: 10,
                ...PF,
                padding: '8px 4px',
                cursor: 'pointer',
                fontWeight: activePreset === 'high-risk' ? 'bold' : 'normal',
                transition: 'all 0.2s ease',
              }}
            >
              High Risk
            </button>
            <button
              onClick={() => applyPreset('safe')}
              style={{
                flex: 1,
                background: activePreset === 'safe' ? 'rgba(57,255,20,0.30)' : 'rgba(57,255,20,0.10)',
                border: activePreset === 'safe' ? '2px solid rgba(57,255,20,0.70)' : '1px solid rgba(57,255,20,0.30)',
                borderRadius: 6,
                color: activePreset === 'safe' ? '#39ff14' : '#7fff7f',
                fontSize: 10,
                ...PF,
                padding: '8px 4px',
                cursor: 'pointer',
                fontWeight: activePreset === 'safe' ? 'bold' : 'normal',
                transition: 'all 0.2s ease',
              }}
            >
              Safe Bets
            </button>
            <button
              onClick={() => applyPreset('live')}
              style={{
                flex: 1,
                background: activePreset === 'live' ? 'rgba(255,51,51,0.30)' : 'rgba(255,51,51,0.10)',
                border: activePreset === 'live' ? '2px solid rgba(255,51,51,0.70)' : '1px solid rgba(255,51,51,0.30)',
                borderRadius: 6,
                color: activePreset === 'live' ? '#ff3333' : '#ff8888',
                fontSize: 10,
                ...PF,
                padding: '8px 4px',
                cursor: 'pointer',
                fontWeight: activePreset === 'live' ? 'bold' : 'normal',
                transition: 'all 0.2s ease',
              }}
            >
              Live Now
            </button>
          </div>

          {/* Quick Filters Section */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.10)',
            paddingTop: 8,
            marginBottom: 4,
          }}>
            <div style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', marginBottom: 6 }}>
              Quick Filters
            </div>
          </div>

          {/* Sport */}
          <select style={selectStyle} value={sport} onChange={e => setSport(e.target.value)}>
            <option value="">All Sports</option>
            <option value="baseball">Baseball</option>
            <option value="football">Football</option>
            <option value="basketball">Basketball</option>
            <option value="hockey">Hockey</option>
          </select>

          {/* Team Search */}
          <input style={inputStyle} placeholder="Search teams…"
            value={homeTeam} onChange={e => { setHomeTeam(e.target.value); setAwayTeam(e.target.value); }} onKeyDown={onKeyDown} />

          {/* Profit Range */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={halfInput} type="number" placeholder="Min Profit %"
              value={minProfit} onChange={e => setMinProfit(e.target.value)} onKeyDown={onKeyDown} />
            <input style={halfInput} type="number" placeholder="Max Profit %"
              value={maxProfit} onChange={e => setMaxProfit(e.target.value)} onKeyDown={onKeyDown} />
          </div>

          {/* Advanced Filters Toggle */}
          <details style={{ marginTop: 4 }}>
            <summary style={{
              color: '#888',
              fontSize: 10,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '4px 0',
              ...PF,
            }}>
              Advanced Filters
            </summary>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 7 }}>
              {/* Market Type */}
              <select style={selectStyle} value={marketType} onChange={e => setMarketType(e.target.value)}>
                <option value="">All Market Types</option>
                <option value="spread">Spread</option>
                <option value="moneyline">Moneyline</option>
                <option value="over/under">Over/Under</option>
              </select>

              {/* Confidence */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={halfInput} type="number" step="0.01" placeholder="Min Conf"
                  value={minConf} onChange={e => setMinConf(e.target.value)} onKeyDown={onKeyDown} />
                <input style={halfInput} type="number" step="0.01" placeholder="Max Conf"
                  value={maxConf} onChange={e => setMaxConf(e.target.value)} onKeyDown={onKeyDown} />
              </div>

              {/* Risk */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={halfInput} type="number" step="0.01" placeholder="Min Risk"
                  value={minRisk} onChange={e => setMinRisk(e.target.value)} onKeyDown={onKeyDown} />
                <input style={halfInput} type="number" step="0.01" placeholder="Max Risk"
                  value={maxRisk} onChange={e => setMaxRisk(e.target.value)} onKeyDown={onKeyDown} />
              </div>

              {/* Volume */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={halfInput} type="number" placeholder="Min Vol $"
                  value={minVolume} onChange={e => setMinVolume(e.target.value)} onKeyDown={onKeyDown} />
                <input style={halfInput} type="number" placeholder="Max Vol $"
                  value={maxVolume} onChange={e => setMaxVolume(e.target.value)} onKeyDown={onKeyDown} />
              </div>

              {/* Sportsbook */}
              <input style={inputStyle} placeholder="Sportsbook name…"
                value={sportsbook} onChange={e => setSportsbook(e.target.value)} onKeyDown={onKeyDown} />

              {/* Date Range */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input style={inputStyle} type="date" placeholder="From"
                  value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                <input style={inputStyle} type="date" placeholder="To"
                  value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
          </details>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={btn(true)}  onClick={handleSearch}>Apply</button>
            <button style={btn(false)} onClick={handleClear}>Reset</button>
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
            ...PF,
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
          borderRadius: 8, padding: '10px 14px', ...PF, fontSize: 11,
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
