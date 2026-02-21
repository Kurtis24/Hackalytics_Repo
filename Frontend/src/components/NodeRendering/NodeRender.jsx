import { useEffect, useRef, useState } from 'react';
import { SceneManager } from './SceneManager.js';
import { generateMockNodes, generateConnections } from './mockData.js';

// ─── Component ────────────────────────────────────────────────────────────────
export default function NodeRender() {
  const canvasRef  = useRef(null);
  const managerRef = useRef(null);
  const [error, setError]   = useState(null);

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
    } catch (err) {
      console.error('[NodeRender]', err);
      setError(err.message ?? String(err));
    }

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

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

      {/* Legend overlay */}
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
