import { useState } from 'react';
import { useData } from '../context/DataContext';
import { runMlPipeline, fetchNodes } from '../api/nodeApi';
import { adaptMlNodes } from '../utils/dataAdapter';
import MLLoadingOverlay from '../components/MLLoadingOverlay';

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function Execute({ onNav }) {
  const { updateArbitrageData, setLoadingState, setErrorState, resetToMock } = useData();
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null); // 'execute' | 'ml'

  /** Execute Backend: run ML pipeline (150 games → Databricks), store nodes on backend, show in app, then navigate. */
  async function handleExecute() {
    setLocalLoading(true);
    setLoadingAction('execute');
    setLoadingState(true);
    setLocalError(null);
    setErrorState(null);
    updateArbitrageData([]);
    try {
      console.log('[Execute] Calling runMlPipeline...');
      const nodes = await runMlPipeline(true);
      console.log('[Execute] Received nodes from backend:', nodes);
      console.log('[Execute] Total nodes received:', nodes?.length || 0);

      // Log first 3 nodes to see their actual data
      if (nodes && nodes.length > 0) {
        console.log('[Execute] Sample node data (first 3):');
        nodes.slice(0, 3).forEach((node, i) => {
          console.log(`  Node ${i}:`, {
            category: node.category,
            home_team: node.home_team,
            away_team: node.away_team,
            profit_score: node.profit_score,
            risk_score: node.risk_score,
            confidence: node.confidence,
            volume: node.volume,
            date: node.date,
            market_type: node.market_type,
          });
        });
      }

      const frontendNodes = adaptMlNodes(nodes);
      console.log('[Execute] Adapted nodes for frontend:', frontendNodes);
      console.log('[Execute] Total adapted nodes:', frontendNodes?.length || 0);

      // Log first 3 adapted nodes
      if (frontendNodes && frontendNodes.length > 0) {
        console.log('[Execute] Sample adapted nodes (first 3):');
        frontendNodes.slice(0, 3).forEach((node, i) => {
          console.log(`  Adapted node ${i}:`, node);
        });
      }

      updateArbitrageData(frontendNodes);
      setTimeout(() => onNav('product'), 500);
    } catch (err) {
      console.error('[Execute] Error:', err);
      setLocalError(err.message);
      setErrorState(err.message);
    } finally {
      setLocalLoading(false);
      setLoadingAction(null);
      setLoadingState(false);
    }
  }

  /** Load from ML: fetch nodes stored by Execute Backend (GET /nodes) and show in app; then go to product. */
  async function handleLoadFromMl() {
    setLocalLoading(true);
    setLoadingAction('ml');
    setLoadingState(true);
    setLocalError(null);
    setErrorState(null);
    try {
      const nodes = await fetchNodes();
      const frontendNodes = adaptMlNodes(nodes);
      updateArbitrageData(frontendNodes);
      setTimeout(() => onNav('product'), 500);
    } catch (err) {
      setLocalError(err.message);
      setErrorState(err.message);
    } finally {
      setLocalLoading(false);
      setLoadingAction(null);
      setLoadingState(false);
    }
  }

  /** Use Mock Data: switch to built-in mock nodes (no backend), then go to product. */
  function handleUseMock() {
    resetToMock();
    onNav('product');
  }

  return (
    <div style={{
      width: '100vw',
      height: 'calc(100vh - 57px)',
      background: 'linear-gradient(135deg, #0a0a14 0%, #1a1a2e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Full-screen ML loading overlay when Execute Backend is running the pipeline */}
      {localLoading && loadingAction === 'execute' && <MLLoadingOverlay />}

      <div style={{
        maxWidth: '600px',
        padding: '48px',
        background: 'rgba(8,8,20,0.85)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '16px',
        textAlign: 'center',
      }}>
        <h1 style={{
          ...PF,
          fontSize: '3rem',
          fontWeight: 400,
          color: '#fff',
          marginBottom: '16px',
          letterSpacing: '0.02em',
        }}>
          Arbitrage Discovery
        </h1>
        
        <p style={{
          ...PF,
          fontSize: '1.1rem',
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.6,
          marginBottom: '40px',
          fontWeight: 300,
        }}>
          Execute the ML model to discover real-time arbitrage opportunities across sports betting markets, or explore with mock data.
        </p>

        {localError && (
          <div style={{
            background: 'rgba(255,107,107,0.15)',
            border: '1px solid rgba(255,107,107,0.40)',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '24px',
            color: '#ff6b6b',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
          }}>
            Error: {localError}
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={handleExecute}
            disabled={localLoading}
            style={{
              ...PF,
              background: localLoading ? 'rgba(57,255,20,0.10)' : 'rgba(57,255,20,0.20)',
              border: '2px solid rgba(57,255,20,0.50)',
              borderRadius: '12px',
              color: '#39ff14',
              fontSize: '1.1rem',
              fontWeight: 600,
              padding: '16px 40px',
              cursor: localLoading ? 'not-allowed' : 'pointer',
              opacity: localLoading ? 0.6 : 1,
              transition: 'all 0.3s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!localLoading) {
                e.target.style.background = 'rgba(57,255,20,0.30)';
                e.target.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(57,255,20,0.20)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            {localLoading && loadingAction === 'execute' ? 'Running...' : 'Execute Backend'}
          </button>
          <button
            onClick={handleLoadFromMl}
            disabled={localLoading}
            style={{
              ...PF,
              background: localLoading ? 'rgba(100,149,237,0.10)' : 'rgba(100,149,237,0.20)',
              border: '2px solid rgba(100,149,237,0.50)',
              borderRadius: '12px',
              color: '#6495ed',
              fontSize: '1.1rem',
              fontWeight: 600,
              padding: '16px 40px',
              cursor: localLoading ? 'not-allowed' : 'pointer',
              opacity: localLoading ? 0.6 : 1,
              transition: 'all 0.3s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!localLoading) {
                e.target.style.background = 'rgba(100,149,237,0.30)';
                e.target.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(100,149,237,0.20)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            {localLoading && loadingAction === 'ml' ? 'Loading...' : 'Load from ML'}
          </button>

          <button
            onClick={handleUseMock}
            disabled={localLoading}
            style={{
              ...PF,
              background: 'rgba(255,255,255,0.05)',
              border: '2px solid rgba(255,255,255,0.20)',
              borderRadius: '12px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '1.1rem',
              fontWeight: 600,
              padding: '16px 40px',
              cursor: localLoading ? 'not-allowed' : 'pointer',
              opacity: localLoading ? 0.4 : 1,
              transition: 'all 0.3s',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              if (!localLoading) {
                e.target.style.background = 'rgba(255,255,255,0.10)';
                e.target.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.05)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            Use Mock Data
          </button>
        </div>

        <p style={{
          ...PF,
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.4)',
          marginTop: '32px',
          fontStyle: 'italic',
          fontWeight: 300,
        }}>
          Backend integration ready · Mock data available for testing
        </p>
      </div>
    </div>
  );
}
