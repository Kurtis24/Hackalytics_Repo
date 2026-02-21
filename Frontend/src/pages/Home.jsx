import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function Home() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/health')
      .then(setHealth)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold text-gray-900">Welcome to Hackalytics</h1>
        <p className="mt-2 text-gray-500 text-lg">Your React + FastAPI app is running.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 w-full max-w-sm">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">API Status</h2>
        {error && (
          <p className="text-red-500 text-sm">Could not reach backend: {error}</p>
        )}
        {health && (
          <ul className="text-sm text-gray-700 space-y-1">
            <li><span className="font-medium">Status:</span> <span className="text-green-600">{health.status}</span></li>
            <li><span className="font-medium">Version:</span> {health.version}</li>
            <li><span className="font-medium">Message:</span> {health.message}</li>
          </ul>
        )}
        {!health && !error && (
          <p className="text-gray-400 text-sm animate-pulse">Connecting to backend…</p>
        )}
      </div>
    </main>
  )
}
