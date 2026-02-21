import { useState } from 'react'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Arbitrage from './pages/Arbitrage'

export default function App() {
  const [page, setPage] = useState('home')

  return (
    <>
      <Navbar page={page} onNav={setPage} />
      {page === 'home' && <Home />}
      {page === 'arbitrage' && <Arbitrage />}
    </>
  )
}
