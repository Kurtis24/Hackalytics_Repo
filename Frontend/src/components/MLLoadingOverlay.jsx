/**
 * Full-screen overlay shown while the ML pipeline is running.
 * Disappears when loading is done so you know for sure ML has finished.
 */

const PF = { fontFamily: "'Playfair Display', Georgia, serif" };

export default function MLLoadingOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      <style>{`
        @keyframes ml-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ml-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes ml-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(59, 130, 246, 0.2); }
          50% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.6), 0 0 60px rgba(59, 130, 246, 0.3); }
        }
        @keyframes ml-expand {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes ml-fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ml-loading-ring {
          width: 100px;
          height: 100px;
          border: 3px solid transparent;
          border-top-color: #3b82f6;
          border-right-color: #3b82f6;
          border-radius: 50%;
          animation: ml-spin 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
          position: relative;
        }
        .ml-loading-ring::before {
          content: '';
          position: absolute;
          inset: -3px;
          border-radius: 50%;
          border: 3px solid transparent;
          border-bottom-color: #60a5fa;
          border-left-color: #60a5fa;
          animation: ml-spin 1.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite reverse;
        }
        .ml-loading-ring::after {
          content: '';
          position: absolute;
          inset: 10px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%);
          animation: ml-pulse 1.5s ease-in-out infinite;
        }
        .ml-loading-text {
          animation: ml-fade-in 0.6s ease-out;
        }
        .ml-connector-line {
          animation: ml-expand 1s ease-out forwards;
        }
      `}</style>

      {/* T-shaped connector at top */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'absolute',
        top: '20vh',
      }}>
        <div className="ml-connector-line" style={{
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 50%, transparent)',
          boxShadow: '0 0 10px rgba(255,255,255,0.3)',
          width: 0,
          maxWidth: '320px',
        }} />
        <div style={{
          width: 1,
          height: 48,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), transparent)',
          boxShadow: '0 0 8px rgba(255,255,255,0.35)',
        }} />
      </div>

      {/* Glowing spinner */}
      <div style={{ position: 'relative' }}>
        <div className="ml-loading-ring" />
      </div>

      {/* Loading text */}
      <div className="ml-loading-text" style={{ textAlign: 'center', maxWidth: '500px' }}>
        <h2 style={{
          ...PF,
          color: '#fff',
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          fontWeight: 500,
          fontStyle: 'italic',
          margin: 0,
          marginBottom: 16,
          letterSpacing: '0.01em',
        }}>
          Discovering Arbitrage
        </h2>
        <p style={{
          ...PF,
          color: 'rgba(255,255,255,0.6)',
          fontSize: '0.95rem',
          margin: 0,
          fontWeight: 300,
          lineHeight: 1.6,
        }}>
          Analyzing 150+ games across basketball, hockey, baseball & football
        </p>
      </div>

      {/* Blue gradient wave at bottom */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '300px',
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 80% 50% at 20% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
          radial-gradient(ellipse 80% 50% at 50% 60%, rgba(37, 99, 235, 0.4) 0%, transparent 50%),
          radial-gradient(ellipse 80% 50% at 80% 50%, rgba(59, 130, 246, 0.3) 0%, transparent 50%),
          linear-gradient(180deg, transparent 0%, rgba(29, 78, 216, 0.15) 50%, transparent 100%)
        `,
      }} />
    </div>
  );
}
