import { useState, useMemo } from 'react';
import NodeRender from '../components/NodeRendering/NodeRender';
import BetSimulator from '../components/BetSimulator/BetSimulator';
import MLLoadingOverlay from '../components/MLLoadingOverlay';
import { useData } from '../context/DataContext.jsx';

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function NodeView() {
  const [selectedNode, setSelectedNode] = useState(null);
  const { isLoading, getNodes, dataMode } = useData();
  const [showStats, setShowStats] = useState(true);

  // Calculate node statistics
  const nodeStats = useMemo(() => {
    const nodes = getNodes();
    const total = nodes.length;

    console.log('[NodeView] Calculating stats for nodes:', nodes);
    console.log('[NodeView] Total nodes:', total);
    console.log('[NodeView] Data mode:', dataMode);

    // Group by sport/category
    const byCategory = {};
    nodes.forEach(node => {
      const cat = node.category || node.sport || 'unknown';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    console.log('[NodeView] Nodes by category:', byCategory);

    return { total, byCategory };
  }, [getNodes, dataMode]);

  // Only show the product graph once loading is complete (e.g. all ML nodes loaded)
  if (isLoading) {
    return <MLLoadingOverlay />;
  }

  return (
    <div style={{ 
      width: '100%', 
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #07070f 0%, #0a0a14 50%, #0d0d18 100%)',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* 3D Visualization container */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto 60px',
        padding: '0 48px',
        paddingTop: '60px',
      }}>
        <div style={{
          width: '100%',
          height: '800px',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          position: 'relative',
        }}>
          <NodeRender onNodeSelect={setSelectedNode} />
        </div>

        {/* Node Statistics Panel */}
        {showStats && (
          <div style={{
            marginTop: '24px',
            background: 'rgba(8,8,20,0.90)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '12px',
            padding: '24px',
            position: 'relative',
          }}>
            {/* Close button */}
            <button
              onClick={() => setShowStats(false)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '4px',
                color: '#999',
                fontSize: '10px',
                ...PF,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              ✕ Hide
            </button>

            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '20px',
            }}>
              <h3 style={{
                ...PF,
                fontSize: '1.8rem',
                fontWeight: 400,
                color: '#fff',
                margin: 0,
                letterSpacing: '0.02em',
              }}>
                Node Statistics
              </h3>
              <div style={{
                background: dataMode === 'live' ? 'rgba(57,255,20,0.15)' : 'rgba(100,149,237,0.15)',
                border: `1px solid ${dataMode === 'live' ? 'rgba(57,255,20,0.40)' : 'rgba(100,149,237,0.40)'}`,
                borderRadius: '6px',
                padding: '4px 12px',
                ...PF,
                fontSize: '0.85rem',
                color: dataMode === 'live' ? '#39ff14' : '#6495ed',
                fontWeight: 600,
              }}>
                {dataMode === 'live' ? 'LIVE DATA' : 'MOCK DATA'}
              </div>
            </div>

            {/* Total Nodes */}
            <div style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '12px',
              marginBottom: '24px',
            }}>
              <span style={{
                ...PF,
                fontSize: '3.5rem',
                fontWeight: 600,
                color: '#39ff14',
                lineHeight: 1,
              }}>
                {nodeStats.total.toLocaleString()}
              </span>
              <span style={{
                ...PF,
                fontSize: '1.2rem',
                color: 'rgba(255,255,255,0.6)',
                fontWeight: 300,
              }}>
                Total Nodes
              </span>
            </div>

            {/* Breakdown by Category */}
            {Object.keys(nodeStats.byCategory).length > 0 && (
              <div>
                <h4 style={{
                  ...PF,
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.8)',
                  marginBottom: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  By Sport
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}>
                  {Object.entries(nodeStats.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => {
                      const colorMap = {
                        baseball: '#ff7043',
                        football: '#42a5f5',
                        basketball: '#ffca28',
                        hockey: '#26c6da',
                      };
                      const color = colorMap[category.toLowerCase()] || '#999';

                      return (
                        <div
                          key={category}
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                width: '12px',
                                height: '12px',
                                background: color,
                                borderRadius: '50%',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{
                              ...PF,
                              fontSize: '0.95rem',
                              color: 'rgba(255,255,255,0.9)',
                              textTransform: 'capitalize',
                            }}>
                              {category.replace('_', ' ')}
                            </span>
                          </div>
                          <span style={{
                            ...PF,
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            color: color,
                          }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show Stats Button (when hidden) */}
        {!showStats && (
          <button
            onClick={() => setShowStats(true)}
            style={{
              marginTop: '24px',
              background: 'rgba(57,255,20,0.15)',
              border: '1px solid rgba(57,255,20,0.40)',
              borderRadius: '8px',
              color: '#39ff14',
              fontSize: '0.95rem',
              ...PF,
              fontWeight: 600,
              padding: '12px 24px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            ℹ Show Node Statistics ({nodeStats.total} nodes)
          </button>
        )}
      </div>

      {/* Bet Simulator */}
      {selectedNode && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto 60px',
          padding: '0 48px',
        }}>
          <BetSimulator selectedNode={selectedNode} />
        </div>
      )}
      
    </div>
  );
}
