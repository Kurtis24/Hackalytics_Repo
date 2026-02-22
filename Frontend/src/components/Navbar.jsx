export default function Navbar({ page, onNav }) {
  const link = (id, label) => (
    <button
      key={id}
      onClick={() => onNav(id)}
      className={`nav-link ${page === id ? 'active' : ''}`}
        style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.95rem',
        color: page === id ? '#fff' : 'rgba(255,255,255,0.5)',
        textDecoration: 'none',
        transition: 'color 0.2s',
        padding: '4px 0',
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </button>
  )

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        gap: '40px',
        padding: '18px 0',
        background: 'transparent',
      }}
    >
      {link('home',      'Home')}
      {link('product',   'Product')}
    </nav>
  )
}
