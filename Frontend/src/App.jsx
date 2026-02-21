import { useState } from 'react'
import { DataProvider } from './context/DataContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Execute from './pages/Execute'
import NodeView from './pages/NodeView'

export default function App() {
  const [page, setPage] = useState('product')
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
      <Navbar page={page} onNav={handleNav} />
      {page === 'home' && <Home onNav={handleNav} />}
      {page === 'product' && showExecute && <Execute onNav={handleExecuteNav} />}
      {page === 'product' && !showExecute && <NodeView />}
    </DataProvider>
  )
}
