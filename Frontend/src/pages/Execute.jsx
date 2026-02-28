import { useState } from 'react';
import { useData } from '../context/DataContext';
import { fetchNodes } from '../api/nodeApi';
import { adaptMlNodes } from '../utils/dataAdapter';

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function Execute({ onNav }) {
  const { updateArbitrageData, setLoadingState, setErrorState } = useData();
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  /** Load from Database: fetch nodes from Supabase (populated by CRON job) and navigate to product view. */
  async function handleLoadFromDatabase() {
    setLocalLoading(true);
    setLoadingState(true);
    setLocalError(null);
    setErrorState(null);
    try {
      console.log('[Execute] Fetching nodes from database...');
      const nodes = await fetchNodes();
      console.log('[Execute] Received nodes from database:', nodes);
      console.log('[Execute] Total nodes received:', nodes?.length || 0);

      const frontendNodes = adaptMlNodes(nodes);
      console.log('[Execute] Adapted nodes for frontend:', frontendNodes);
      console.log('[Execute] Total adapted nodes:', frontendNodes?.length || 0);

      updateArbitrageData(frontendNodes);
      setTimeout(() => onNav('product'), 500);
    } catch (err) {
      console.error('[Execute] Error:', err);
      setLocalError(err.message);
      setErrorState(err.message);
    } finally {
      setLocalLoading(false);
      setLoadingState(false);
    }
  }

  return (
    <div style={{
      width: '100vw',
      minHeight: 'calc(100vh - 57px)',
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
      padding: '80px 24px',
    }}>
      {/* T-shaped connector at top */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 40,
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: 320,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 50%, transparent)',
          boxShadow: '0 0 10px rgba(255,255,255,0.3)',
        }} />
        <div style={{
          width: 1,
          height: 48,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), transparent)',
          boxShadow: '0 0 8px rgba(255,255,255,0.35)',
        }} />
      </div>

      {/* Main content */}
      <div style={{
        maxWidth: '680px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <h1 style={{
          ...PF,
          fontSize: 'clamp(2.5rem, 5.5vw, 3.8rem)',
          fontWeight: 500,
          fontStyle: 'italic',
          textAlign: 'center',
          lineHeight: 1.15,
          letterSpacing: '0.01em',
          color: '#fff',
          marginBottom: '24px',
        }}>
          Arbitrage Discovery
        </h1>

        <p style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: '1rem',
          marginBottom: '48px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          View arbitrage opportunities automatically updated monthly by CRON
        </p>

        {localError && (
          <div style={{
            background: 'rgba(255,107,107,0.15)',
            border: '1px solid rgba(255,107,107,0.40)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '32px',
            color: '#ff6b6b',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}>
            Error: {localError}
          </div>
        )}

        <button
          onClick={handleLoadFromDatabase}
          disabled={localLoading}
          className="btn-outline"
          style={{
            ...PF,
            fontSize: '1.1rem',
            padding: '16px 48px',
            cursor: localLoading ? 'not-allowed' : 'pointer',
            opacity: localLoading ? 0.6 : 1,
          }}
        >
          {localLoading ? 'Loading...' : 'View Opportunities'}
        </button>
      </div>

      {/* T-shaped connector at bottom */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 40,
        position: 'relative',
        zIndex: 2,
      }}>
        <div style={{
          width: 1,
          height: 48,
          background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.9))',
          boxShadow: '0 0 8px rgba(255,255,255,0.35)',
        }} />
        <div style={{
          width: 320,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 50%, transparent)',
          boxShadow: '0 0 10px rgba(255,255,255,0.3)',
        }} />
      </div>

      {/* Blue gradient wave at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '300px',
        pointerEvents: 'none',
        zIndex: 1,
        background: `
          radial-gradient(ellipse 80% 50% at 20% 50%, rgba(59, 130, 246, 0.4) 0%, transparent 50%),
          radial-gradient(ellipse 80% 50% at 50% 60%, rgba(37, 99, 235, 0.5) 0%, transparent 50%),
          radial-gradient(ellipse 80% 50% at 80% 50%, rgba(59, 130, 246, 0.4) 0%, transparent 50%),
          linear-gradient(180deg, transparent 0%, rgba(29, 78, 216, 0.2) 50%, transparent 100%)
        `,
      }} />
    </div>
  );
}
