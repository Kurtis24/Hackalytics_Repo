import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { DataProvider } from './context/DataContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Execute from './pages/Execute'
import NodeView from './pages/NodeView'
import Privacy from './pages/Privacy'
import Terms from './pages/Terms'

export default function App() {
  const [page, setPage] = useState('home')
  const [showExecute, setShowExecute] = useState(true)

  const handleNav = (newPage) => {
    setPage(newPage);
    if (newPage === 'product') {
      setShowExecute(true);
    }
  };

  const handleExecuteNav = (target) => {
    if (target === 'product') {
      setShowExecute(false);
    }
  };

  return (
    <DataProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar page={page} onNav={handleNav} />
        <main style={{ flex: 1, minHeight: '100vh' }}>
          {page === 'home' && <Home onNav={handleNav} />}
          {page === 'product' && showExecute && <Execute onNav={handleExecuteNav} />}
          {page === 'product' && !showExecute && <NodeView />}
          {page === 'privacy' && <Privacy onNav={handleNav} />}
          {page === 'terms' && <Terms onNav={handleNav} />}
        </main>
        <Footer onNav={handleNav} />
      </div>
      <Analytics />
    </DataProvider>
  )
}
