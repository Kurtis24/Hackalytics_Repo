import { useEffect, useRef, useState, useCallback } from 'react';
import { SceneManager } from './SceneManager.js';
import { generateMockNodes, generateConnections } from './mockData.js';

// ─── Component ────────────────────────────────────────────────────────────────
export default function NodeRender() {
  const canvasRef  = useRef(null);
  const managerRef = useRef(null);
  const [error, setError]             = useState(null);
  const [ready, setReady]             = useState(false);

  // ── Search state ──────────────────────────────────────────────────────────
  const [searchText,    setSearchText]    = useState('');
  const [searchCluster, setSearchCluster] = useState('');
  const [minProfit,     setMinProfit]     = useState('');
  const [maxProfit,     setMaxProfit]     = useState('');
  const [resultInfo,    setResultInfo]    = useState(null); // null | { count, query }

  // ── Scene setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const manager = new SceneManager(canvas);
      managerRef.current = manager;

      const nodes       = generateMockNodes(20000);
      const connections = generateConnections(nodes);
      manager.loadNodes(nodes, connections);
      manager.start();
      setReady(true);
    } catch (err) {
      console.error('[NodeRender]', err);
      setError(err.message ?? String(err));
    }

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  // ── Search handler ────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const nr = managerRef.current?.nodeRenderer;
    if (!nr) return;

    const criteria = {};
    if (searchText.trim())  criteria.text      = searchText.trim();
    if (searchCluster)      criteria.cluster   = searchCluster;
    if (minProfit !== '')   criteria.minProfit = +minProfit;
    if (maxProfit !== '')   criteria.maxProfit = +maxProfit;

    // Need at least one criterion
    if (!Object.keys(criteria).length) return;

    const indices = nr.search(criteria);
    const count   = nr.applySearchResults(indices);
    setResultInfo({ count, query: criteria });
  }, [searchText, searchCluster, minProfit, maxProfit]);

  const handleClear = useCallback(() => {
    const nr = managerRef.current?.nodeRenderer;
    nr?.clearSearchResults();
    nr?.clearFocus();
    setResultInfo(null);
    setSearchText('');
    setSearchCluster('');
    setMinProfit('');
    setMaxProfit('');
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  // ── Cluster list for dropdown ─────────────────────────────────────────────
  const CLUSTERS = ['sports', 'quant', 'crypto', 'football', 'forex', 'commodities'];

  // ── Input style ───────────────────────────────────────────────────────────
  const inputStyle = {
    background:  'rgba(255,255,255,0.07)',
    border:      '1px solid rgba(255,255,255,0.15)',
    borderRadius: 4,
    color:       '#e8e8f0',
    fontSize:    11,
    fontFamily:  'monospace',
    padding:     '4px 7px',
    outline:     'none',
    width:       '100%',
    boxSizing:   'border-box',
  };

  const btnStyle = (primary) => ({
    background:   primary ? 'rgba(57,255,20,0.18)' : 'rgba(255,255,255,0.06)',
    border:       primary ? '1px solid rgba(57,255,20,0.45)' : '1px solid rgba(255,255,255,0.12)',
    borderRadius: 4,
    color:        primary ? '#39ff14' : '#aaa',
    fontSize:     11,
    fontFamily:   'monospace',
    padding:      '4px 12px',
    cursor:       'pointer',
    flex:         1,
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
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

      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* ── Search panel ──────────────────────────────────────────────────── */}
      {ready && (
        <div style={{
          position:   'absolute',
          top:        16,
          right:      16,
          width:      220,
          background: 'rgba(8,8,20,0.88)',
          border:     '1px solid rgba(255,255,255,0.10)',
          borderRadius: 8,
          padding:    '12px 14px',
          color:      '#ccc',
          fontSize:   11,
          fontFamily: 'monospace',
          zIndex:     10,
          display:    'flex',
          flexDirection: 'column',
          gap:        8,
        }}>
          <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 2 }}>Search nodes</div>

          {/* Text */}
          <input
            style={inputStyle}
            placeholder="node ID substring…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onKeyDown={onKeyDown}
          />

          {/* Cluster */}
          <select
            style={{ ...inputStyle, appearance: 'none' }}
            value={searchCluster}
            onChange={e => setSearchCluster(e.target.value)}
          >
            <option value="">Any cluster</option>
            {CLUSTERS.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>

          {/* Profit range */}
          <div style={{ color: '#888', fontSize: 10, marginBottom: -4 }}>Profit % range</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              style={{ ...inputStyle, width: '50%' }}
              type="number"
              placeholder="min"
              value={minProfit}
              onChange={e => setMinProfit(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <input
              style={{ ...inputStyle, width: '50%' }}
              type="number"
              placeholder="max"
              value={maxProfit}
              onChange={e => setMaxProfit(e.target.value)}
              onKeyDown={onKeyDown}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btnStyle(true)}  onClick={handleSearch}>Search</button>
            <button style={btnStyle(false)} onClick={handleClear}>Clear</button>
          </div>

          {/* Result count */}
          {resultInfo !== null && (
            <div style={{
              color:      resultInfo.count > 0 ? '#39ff14' : '#ff6b6b',
              fontSize:   10,
              marginTop:  -2,
              textAlign:  'center',
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

      {/* ── Legend overlay ────────────────────────────────────────────────── */}
      <div style={{
        position:   'absolute',
        bottom:     16,
        left:       16,
        background: 'rgba(8,8,20,0.80)',
        border:     '1px solid rgba(255,255,255,0.10)',
        borderRadius: 8,
        padding:    '10px 14px',
        color:      '#ccc',
        fontSize:   11,
        fontFamily: 'monospace',
        lineHeight: 1.8,
        pointerEvents: 'none',
      }}>
        <div style={{ marginBottom: 4, color: '#fff', fontWeight: 'bold' }}>Clusters</div>
        {[
          { label: 'Sports',      color: '#ff6b6b' },
          { label: 'Quant',       color: '#4ecdc4' },
          { label: 'Crypto',      color: '#f7d794' },
          { label: 'Football',    color: '#55efc4' },
          { label: 'Forex',       color: '#fd79a8' },
          { label: 'Commodities', color: '#e17055' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display:      'inline-block',
              width:        10,
              height:       10,
              borderRadius: '50%',
              background:   color,
              flexShrink:   0,
            }} />
            {label}
          </div>
        ))}
        <div style={{ marginTop: 8, color: '#888', fontSize: 10 }}>
          Hover to inspect · Click to focus &amp; glow
        </div>
      </div>
    </div>
  );
}
