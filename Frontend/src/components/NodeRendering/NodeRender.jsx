import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './SceneManager.js';
import { generateMockNodes, generateConnections } from './mockData.js';

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
  const [resultInfo, setResultInfo] = useState(null);

  // ── Scene setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const manager     = new SceneManager(canvas);
      managerRef.current = manager;
      const nodes       = generateMockNodes(1000);
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
    const nr = managerRef.current?.nodeRenderer;
    if (!nr) return;

    const criteria = {};
    if (searchText.trim()) criteria.text      = searchText.trim();
    if (liveOnly)          criteria.live      = true;
    if (minProfit !== '')  criteria.minProfit = +minProfit;
    if (maxProfit !== '')  criteria.maxProfit = +maxProfit;
    if (minConf   !== '')  criteria.minConf   = +minConf;
    if (maxConf   !== '')  criteria.maxConf   = +maxConf;
    if (minRisk   !== '')  criteria.minRisk   = +minRisk;
    if (maxRisk   !== '')  criteria.maxRisk   = +maxRisk;

    if (!Object.keys(criteria).length) return;

    const indices = nr.search(criteria);
    nr.applySearchResults(indices);
    setResultInfo({ count: indices.length });
  }, [searchText, liveOnly, minProfit, maxProfit, minConf, maxConf, minRisk, maxRisk]);

  const handleClear = useCallback(() => {
    const nr = managerRef.current?.nodeRenderer;
    nr?.clearSearchResults();
    nr?.clearFocus();
    setResultInfo(null);
    setSearchText(''); setLiveOnly(false);
    setMinProfit(''); setMaxProfit('');
    setMinConf('');   setMaxConf('');
    setMinRisk('');   setMaxRisk('');
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

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
          position: 'absolute', top: 16, right: 16, width: 230,
          background: 'rgba(8,8,20,0.90)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 11,
          color: '#ccc', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 2 }}>Search nodes</div>

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
        </div>
      )}

      {/* ── Legend / axis key ───────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
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
              border: '1.5px solid #ffffff', flexShrink: 0,
            }} />
            Live
          </div>
          <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
            Size = volume · Hover to inspect · Click to focus
          </div>
        </div>
      </div>
    </div>
  );
}
