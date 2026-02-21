import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function Odds() {
  const [sports, setSports] = useState([])
  const [selectedSport, setSelectedSport] = useState('')
  const [odds, setOdds] = useState([])
  const [loadingSports, setLoadingSports] = useState(true)
  const [loadingOdds, setLoadingOdds] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/odds/sports')
      .then((data) => {
        const active = data.filter((s) => s.active)
        setSports(active)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSports(false))
  }, [])

  useEffect(() => {
    if (!selectedSport) return
    setLoadingOdds(true)
    setOdds([])
    setError(null)
    api.get(`/odds/${selectedSport}`)
      .then(setOdds)
      .catch((err) => setError(err.message))
      .finally(() => setLoadingOdds(false))
  }, [selectedSport])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Live Odds</h1>
        <p className="text-gray-500 mb-6">Powered by The Odds API</p>

        {error && (
          <p className="text-red-500 mb-4 text-sm">Error: {error}</p>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Sport</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full max-w-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
            disabled={loadingSports}
          >
            <option value="">{loadingSports ? 'Loading sports…' : '-- Choose a sport --'}</option>
            {sports.map((s) => (
              <option key={s.key} value={s.key}>{s.title}</option>
            ))}
          </select>
        </div>

        {loadingOdds && (
          <p className="text-gray-400 text-sm animate-pulse">Fetching odds…</p>
        )}

        {odds.length > 0 && (
          <div className="space-y-4">
            {odds.map((event) => {
              const bookmaker = event.bookmakers?.[0]
              const market = bookmaker?.markets?.[0]
              const outcomes = market?.outcomes ?? []
              return (
                <div key={event.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-semibold text-gray-900">
                      {event.home_team} vs {event.away_team}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(event.commence_time).toLocaleString()}
                    </span>
                  </div>
                  {bookmaker && (
                    <p className="text-xs text-gray-400 mb-2">via {bookmaker.title}</p>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    {outcomes.map((o) => (
                      <div key={o.name} className="bg-indigo-50 rounded-lg px-4 py-2 text-center">
                        <p className="text-xs text-gray-500">{o.name}</p>
                        <p className="text-lg font-bold text-indigo-600">{o.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loadingOdds && selectedSport && odds.length === 0 && !error && (
          <p className="text-gray-400 text-sm">No odds available for this sport right now.</p>
        )}
      </div>
    </main>
  )
}
