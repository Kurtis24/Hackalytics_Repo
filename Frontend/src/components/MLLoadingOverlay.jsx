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
        background: 'rgba(7, 7, 15, 0.97)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
      }}
    >
      <style>{`
        @keyframes ml-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes ml-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes ml-dots {
          0%, 20% { content: '.'; }
          40% { content: '..'; }
          60%, 100% { content: '...'; }
        }
        .ml-loading-ring {
          width: 72px;
          height: 72px;
          border: 4px solid rgba(100, 149, 237, 0.2);
          border-top-color: #6495ed;
          border-radius: 50%;
          animation: ml-spin 0.9s linear infinite;
        }
        .ml-loading-ring-outer {
          width: 88px;
          height: 88px;
          border: 3px solid rgba(57, 255, 20, 0.15);
          border-bottom-color: rgba(57, 255, 20, 0.6);
          border-radius: 50%;
          animation: ml-spin 1.4s linear infinite reverse;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ml-loading-text {
          animation: ml-pulse 1.2s ease-in-out infinite;
        }
      `}</style>

      <div className="ml-loading-ring-outer">
        <div className="ml-loading-ring" />
      </div>

      <div className="ml-loading-text" style={{ textAlign: 'center' }}>
        <p style={{ ...PF, color: '#fff', fontSize: '1.35rem', fontWeight: 600, margin: 0 }}>
          Loading ML nodes
          <span style={{ display: 'inline-block', width: '1.2em', textAlign: 'left' }}>...</span>
        </p>
        <p style={{
          ...PF,
          color: 'rgba(255,255,255,0.55)',
          fontSize: '0.9rem',
          marginTop: 8,
          fontWeight: 400,
        }}>
          Fetching games & running model — this may take a minute
        </p>
      </div>

      <div style={{
        width: 200,
        height: 4,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: '40%',
          background: 'linear-gradient(90deg, #6495ed, rgba(57,255,20,0.7))',
          borderRadius: 2,
          animation: 'ml-pulse 1.2s ease-in-out infinite',
        }} />
      </div>
    </div>
  );
}
