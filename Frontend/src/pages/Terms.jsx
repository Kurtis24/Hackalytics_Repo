const PF = { fontFamily: "'Playfair Display', Georgia, serif" }

const sectionStyle = {
  ...PF,
  marginBottom: 40,
}
const h2Style = {
  ...PF,
  fontSize: '1.15rem',
  fontWeight: 600,
  color: '#fff',
  marginBottom: 12,
  letterSpacing: '0.02em',
}
const pStyle = {
  ...PF,
  fontSize: '0.95rem',
  color: 'rgba(255,255,255,0.85)',
  lineHeight: 1.75,
  marginBottom: 12,
}
const listStyle = {
  ...PF,
  fontSize: '0.95rem',
  color: 'rgba(255,255,255,0.85)',
  lineHeight: 1.75,
  marginLeft: 20,
  marginBottom: 12,
  paddingLeft: 8,
}

export default function Terms({ onNav }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        zIndex: 5,
        padding: '100px 24px 64px',
        maxWidth: 680,
        margin: '0 auto',
      }}
    >
      <button
        type="button"
        onClick={() => onNav('home')}
        style={{
          ...PF,
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.6)',
          cursor: 'pointer',
          fontSize: '0.9rem',
          marginBottom: 40,
          padding: 0,
          borderBottom: '1px solid transparent',
          transition: 'color 0.2s, border-color 0.2s',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
          e.currentTarget.style.borderColor = 'transparent'
        }}
      >
        ← Back to Home
      </button>

      <h1 style={{ ...PF, fontSize: '2rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>
        Terms of Use
      </h1>
      <p style={{ ...pStyle, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>
        Last updated: 28 February 2026
      </p>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: 32 }} />

      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Acceptance of Terms</h2>
        <p style={pStyle}>
          By accessing and using this website, you agree to be bound by these Terms of Use. If you do not agree to these Terms, you should not use this website.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Informational and Analytical Purposes Only</h2>
        <p style={pStyle}>
          This website provides informational and analytical tools related to sports betting markets, including arbitrage modeling and projected profit estimates. All information, projections, and simulations are provided for informational purposes only.
        </p>
        <p style={pStyle}>Nothing on this website constitutes:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>Financial advice</li>
          <li>Investment advice</li>
          <li>Gambling advice</li>
          <li>Legal advice</li>
        </ul>
        <p style={pStyle}>You are solely responsible for your decisions and actions.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. No Guarantee of Accuracy or Profit</h2>
        <p style={pStyle}>
          All data, projections, expected profit estimates, edge calculations, and risk metrics are model-based estimates derived from available market data. Market conditions may change rapidly. Execution timing, line movement, liquidity constraints, and sportsbook policies may affect outcomes.
        </p>
        <p style={pStyle}>We make no representations or warranties regarding:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>Accuracy of data</li>
          <li>Availability of opportunities</li>
          <li>Real-world execution results</li>
          <li>Profitability</li>
        </ul>
        <p style={pStyle}>Profit is not guaranteed.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. No Affiliation with Sportsbooks</h2>
        <p style={pStyle}>
          This website is not affiliated with, endorsed by, or sponsored by any sportsbook, including but not limited to DraftKings, FanDuel, or ESPNBet. All trademarks belong to their respective owners.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. User Responsibility and Assumption of Risk</h2>
        <p style={pStyle}>Sports betting involves substantial risk. By using this website, you acknowledge and agree that:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>You assume all financial risk</li>
          <li>You are solely responsible for your betting decisions</li>
          <li>You will comply with all laws and regulations applicable in your jurisdiction</li>
        </ul>
        <p style={pStyle}>This website does not place bets, manage funds, or execute transactions on your behalf.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Age Restriction</h2>
        <p style={pStyle}>
          This website is intended only for individuals who are at least 18 years old, or the legal gambling age in their jurisdiction, whichever is higher. By using this site, you represent that you meet this requirement.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Limitation of Liability</h2>
        <p style={pStyle}>To the fullest extent permitted by law, the website owner shall not be liable for:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>Financial losses</li>
          <li>Lost profits</li>
          <li>Indirect or consequential damages</li>
          <li>Errors or inaccuracies in data</li>
          <li>Decisions made based on website content</li>
        </ul>
        <p style={pStyle}>Your use of this website is at your own risk.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Changes to the Website</h2>
        <p style={pStyle}>
          We reserve the right to modify, suspend, or discontinue any part of the website at any time without notice. We may also update these Terms of Use from time to time. Continued use of the site constitutes acceptance of any changes.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Governing Law</h2>
        <p style={pStyle}>
          These Terms shall be governed by and construed in accordance with the laws of the Province of Ontario and the federal laws of Canada applicable therein.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>10. Contact</h2>
        <p style={pStyle}>For questions regarding these Terms, contact: brians.24.25@gmail.com</p>
      </section>
    </div>
  )
}
