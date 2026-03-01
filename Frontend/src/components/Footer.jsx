export default function Footer({ onNav }) {
  const linkStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    color: 'rgba(255,255,255,0.7)',
    textDecoration: 'none',
    fontSize: '0.9rem',
    transition: 'color 0.2s',
  }
  const smallStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.5)',
  }

  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 5,
        padding: '24px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 20,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        marginTop: 'auto',
      }}
    >
      {/* Left: copyright */}
      <p style={{ ...smallStyle, margin: 0 }}>
        © 2026 Arbittron. All rights reserved.
      </p>

      {/* Right: links + disclaimer */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onNav('privacy')}
            style={{
              ...linkStyle,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          >
            Privacy Policy
          </button>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <button
            type="button"
            onClick={() => onNav('terms')}
            style={{
              ...linkStyle,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseOver={(e) => { e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)' }}
          >
            Terms of Use
          </button>
        </div>
        <p style={{ ...smallStyle, margin: 0, maxWidth: 360, textAlign: 'right' }}>
          This website is not affiliated with or endorsed by DraftKings, FanDuel, ESPNBet, or any sportsbook.
        </p>
      </div>
    </footer>
  )
}
