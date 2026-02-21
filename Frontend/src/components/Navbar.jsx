export default function Navbar({ page, onNav }) {
  const link = (id, label) => (
    <button
      key={id}
      onClick={() => onNav(id)}
      className={`hover:text-indigo-600 transition-colors ${page === id ? 'text-indigo-600 font-semibold' : ''}`}
    >
      {label}
    </button>
  )

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <span className="text-xl font-bold text-indigo-600 tracking-tight">Hackalytics</span>
      <div className="flex gap-6 text-sm font-medium text-gray-600">
        {link('home', 'Home')}
        {link('arbitrage', 'Arbitrage')}
      </div>
    </nav>
  )
}
