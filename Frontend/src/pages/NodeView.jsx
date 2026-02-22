import { useState } from 'react';
import NodeRender from '../components/NodeRendering/NodeRender';
import BetSimulator from '../components/BetSimulator/BetSimulator';
import MLLoadingOverlay from '../components/MLLoadingOverlay';
import { useData } from '../context/DataContext.jsx';

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function NodeView() {
  const [selectedNode, setSelectedNode] = useState(null);
  const { isLoading } = useData();

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
