import { useState } from 'react';
import { useData } from '../context/DataContext';
import { fetchArbitrageExecutions, transformSupabaseRecordsToNodes } from '../lib/supabase';
import { adaptMlNodes } from '../utils/dataAdapter';

export default function ExecuteButton() {
  const { updateArbitrageData, setLoadingState, setErrorState, dataMode, resetToMock } = useData();
  const [localLoading, setLocalLoading] = useState(false);

  /** Refresh from Database: fetch latest nodes directly from Supabase (populated by CRON). */
  async function handleRefresh() {
    setLocalLoading(true);
    setLoadingState(true);
    setErrorState(null);
    try {
      console.log('[ExecuteButton] Refreshing directly from Supabase...');
      console.log('[ExecuteButton] Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

      // Fetch directly from Supabase
      const records = await fetchArbitrageExecutions();
      console.log('[ExecuteButton] Received records from Supabase:', records?.length || 0);

      if (!records || records.length === 0) {
        console.warn('[ExecuteButton] No records in database');
        setErrorState('No data available. CRON job may not have run yet.');
        return;
      }

      // Transform Supabase records to Node format
      const nodes = transformSupabaseRecordsToNodes(records);
      console.log('[ExecuteButton] Transformed to nodes:', nodes?.length || 0);

      // Adapt for frontend display
      const frontendNodes = adaptMlNodes(nodes);
      console.log('[ExecuteButton] Adapted nodes:', frontendNodes?.length || 0);

      updateArbitrageData(frontendNodes);
    } catch (err) {
      console.error('[ExecuteButton] Error:', err);
      setErrorState(err.message || 'Failed to refresh data');
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
