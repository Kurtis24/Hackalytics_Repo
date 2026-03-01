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

export default function Privacy({ onNav }) {
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
        Privacy Policy
      </h1>
      <p style={{ ...pStyle, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>
        Last updated: 28 February 2026
      </p>

      <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', marginBottom: 32 }} />

      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Overview</h2>
        <p style={pStyle}>
          This website provides informational and analytical tools related to sports betting markets. We value your privacy and aim to collect as little personal information as possible.
        </p>
        <p style={pStyle}>By using this website, you agree to the practices described in this Privacy Policy.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Information We Collect</h2>
        <p style={pStyle}>
          We do not require user accounts and do not collect names, emails, or payment information.
        </p>
        <p style={pStyle}>We may collect limited technical data automatically through analytics tools, including:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>Pages visited</li>
          <li>Referring website</li>
          <li>Browser type</li>
          <li>Device type</li>
          <li>Country or region</li>
          <li>IP address (processed in aggregated or anonymized form)</li>
          <li>Basic performance metrics</li>
        </ul>
        <p style={pStyle}>This data is used strictly for website improvement and performance monitoring.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Analytics</h2>
        <p style={pStyle}>
          We use Vercel Web Analytics to understand site traffic and usage patterns. Vercel Analytics is designed to be privacy-focused and may operate without cookies. Data collected is used in aggregate form and is not used to personally identify visitors.
        </p>
        <p style={pStyle}>For more information, please refer to Vercel’s privacy documentation.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. How We Use Information</h2>
        <p style={pStyle}>We use collected data to:</p>
        <ul style={{ ...listStyle, listStyleType: 'disc' }}>
          <li>Monitor site performance</li>
          <li>Improve user experience</li>
          <li>Detect technical issues</li>
          <li>Understand general usage trends</li>
        </ul>
        <p style={pStyle}>We do not sell, rent, or trade personal data.</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Cookies</h2>
        <p style={pStyle}>
          This website does not use advertising or marketing cookies. If analytics tools use minimal technical storage mechanisms, they are used solely for performance and traffic measurement.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Data Sharing</h2>
        <p style={pStyle}>
          We do not share personal information with third parties except: service providers necessary to operate the website (e.g., hosting and analytics providers), and when required by law.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Data Security</h2>
        <p style={pStyle}>
          We take reasonable measures to protect the limited information processed through this site. However, no method of transmission over the internet is 100% secure.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Age Restriction</h2>
        <p style={pStyle}>
          This website is intended for individuals who are at least 18 years old (or the legal gambling age in their jurisdiction). We do not knowingly collect personal information from minors.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Your Rights</h2>
        <p style={pStyle}>Depending on your location, you may have the right to request access to personal data, request correction or deletion, or object to certain data processing.</p>
        <p style={pStyle}>To make a request, contact: brians.24.25@gmail.com</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>10. Changes to This Policy</h2>
        <p style={pStyle}>
          We may update this Privacy Policy from time to time. Updates will be posted on this page with a revised “Last Updated” date.
        </p>
      </section>
    </div>
  )
}
