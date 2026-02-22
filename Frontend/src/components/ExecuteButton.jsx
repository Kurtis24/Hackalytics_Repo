import { useState } from 'react';
import { useData } from '../context/DataContext';
import { runMlPipeline, fetchNodes } from '../api/nodeApi';
import { adaptMlNodes } from '../utils/dataAdapter';

export default function ExecuteButton() {
  const { updateArbitrageData, setLoadingState, setErrorState, dataMode, resetToMock } = useData();
  const [localLoading, setLocalLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null); // 'execute' | 'ml'

  /** Execute Backend: run ML pipeline, store nodes on backend, show in app. */
  async function handleExecute() {
    setLocalLoading(true);
    setLoadingAction('execute');
    setLoadingState(true);
    setErrorState(null);
    updateArbitrageData([]);
    try {
      const nodes = await runMlPipeline();
      const frontendNodes = adaptMlNodes(nodes);
      updateArbitrageData(frontendNodes);
    } catch (err) {
      setErrorState(err.message);
    } finally {
      setLocalLoading(false);
      setLoadingAction(null);
      setLoadingState(false);
    }
  }

  /** Load from ML: fetch nodes stored by Execute Backend (GET /nodes) and show in app. */
  async function handleLoadFromMl() {
    setLocalLoading(true);
    setLoadingAction('ml');
    setLoadingState(true);
    setErrorState(null);
    try {
      const nodes = await fetchNodes();
      const frontendNodes = adaptMlNodes(nodes);
      updateArbitrageData(frontendNodes);
    } catch (err) {
      setErrorState(err.message);
    } finally {
      setLocalLoading(false);
      setLoadingAction(null);
      setLoadingState(false);
    }
  }

  function handleToggleMode() {
    if (dataMode === 'live') {
      resetToMock();
    }
  }

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 11,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    }}>
      <button
        onClick={handleExecute}
        disabled={localLoading}
        style={{
          background: localLoading ? 'rgba(57,255,20,0.10)' : 'rgba(57,255,20,0.20)',
          border: '1px solid rgba(57,255,20,0.50)',
          borderRadius: 8,
          color: '#39ff14',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          padding: '12px 24px',
          cursor: localLoading ? 'not-allowed' : 'pointer',
          opacity: localLoading ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
      >
        {localLoading && loadingAction === 'execute' ? 'Loading...' : 'Execute Backend'}
      </button>
      <button
        onClick={handleLoadFromMl}
        disabled={localLoading}
        style={{
          background: localLoading ? 'rgba(100,149,237,0.10)' : 'rgba(100,149,237,0.20)',
          border: '1px solid rgba(100,149,237,0.50)',
          borderRadius: 8,
          color: '#6495ed',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 'bold',
          padding: '12px 24px',
          cursor: localLoading ? 'not-allowed' : 'pointer',
          opacity: localLoading ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
      >
        {localLoading && loadingAction === 'ml' ? 'Running ML...' : 'Load from ML'}
      </button>
      
      {dataMode === 'live' && (
        <button
          onClick={handleToggleMode}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.20)',
            borderRadius: 8,
            color: '#999',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '10px 16px',
            cursor: 'pointer',
          }}
        >
          Use Mock Data
        </button>
      )}
      
      <div style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color: dataMode === 'live' ? '#39ff14' : '#888',
        padding: '8px 12px',
        background: 'rgba(8,8,20,0.80)',
        borderRadius: 6,
        border: `1px solid ${dataMode === 'live' ? 'rgba(57,255,20,0.30)' : 'rgba(255,255,255,0.10)'}`,
      }}>
        Mode: {dataMode === 'live' ? 'LIVE' : 'MOCK'}
      </div>
    </div>
  );
}
