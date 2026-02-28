import { useState } from 'react';
import { useData } from '../context/DataContext';
import { fetchNodes } from '../api/nodeApi';
import { adaptMlNodes } from '../utils/dataAdapter';

export default function ExecuteButton() {
  const { updateArbitrageData, setLoadingState, setErrorState, dataMode, resetToMock } = useData();
  const [localLoading, setLocalLoading] = useState(false);

  /** Refresh from Database: fetch latest nodes from Supabase (populated by CRON). */
  async function handleRefresh() {
    setLocalLoading(true);
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
        onClick={handleRefresh}
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
        {localLoading ? 'Loading...' : 'Refresh Data'}
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
