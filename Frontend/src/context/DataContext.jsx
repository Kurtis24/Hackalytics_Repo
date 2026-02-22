import { createContext, useContext, useState, useCallback } from 'react';
import mockNodes from '../data/mockNodes.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [arbitrageData, setArbitrageData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataMode, setDataMode] = useState('mock');

  const updateArbitrageData = useCallback((data) => {
    setArbitrageData(data);
    setDataMode('live');
    setError(null);
  }, []);

  const setLoadingState = useCallback((loading) => {
    setIsLoading(loading);
  }, []);

  const setErrorState = useCallback((err) => {
    setError(err);
    setIsLoading(false);
  }, []);

  const resetToMock = useCallback(() => {
    setArbitrageData([]);
    setDataMode('mock');
    setError(null);
    setIsLoading(false);
  }, []);

  const getNodes = useCallback(() => {
    // In live mode always use arbitrageData (even if empty) so we never show mock after Load from ML / Execute
    if (dataMode === 'live') {
      return arbitrageData;
    }
    return mockNodes;
  }, [dataMode, arbitrageData]);

  const value = {
    arbitrageData,
    isLoading,
    error,
    dataMode,
    updateArbitrageData,
    setLoadingState,
    setErrorState,
    resetToMock,
    getNodes,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
