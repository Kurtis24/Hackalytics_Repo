import { useState } from 'react'
import { api } from '../services/api'

function riskMeta(score) {
  if (score <= 0.25) return { label: 'Low Risk',  bg: 'bg-green-100',  text: 'text-green-700',  bar: 'bg-green-500'  }
  if (score <= 0.50) return { label: 'Moderate',  bg: 'bg-amber-100',  text: 'text-amber-700',  bar: 'bg-amber-400'  }
  if (score <= 0.75) return { label: 'Elevated',  bg: 'bg-orange-100', text: 'text-orange-700', bar: 'bg-orange-500' }
  return               { label: 'High Risk',  bg: 'bg-red-100',    text: 'text-red-700',    bar: 'bg-red-500'    }
}

function Bar({ value, colorClass }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div
        className={`h-2 rounded-full transition-all ${colorClass}`}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}

function StatChip({ label, value, valueClass = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex flex-col items-center gap-0.5 shadow-sm">
      <span className={`text-xl font-bold ${valueClass}`}>{value}</span>
      <span className="text-xs text-gray-500 text-center">{label}</span>
    </div>
  )
}

function OpportunityCard({ opp }) {
  const risk = riskMeta(opp.risk_score)
  const marketLabel = opp.market_type.replace(/_/g, ' ')
  const dateStr = new Date(opp.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100">
        <div>
          <div className="flex gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
              {opp.category}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              {marketLabel}
            </span>
          </div>
          <p className="text-lg font-bold text-gray-900">
            {opp.home_team} <span className="text-gray-400 font-normal">vs</span> {opp.away_team}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full ${risk.bg} ${risk.text}`}>
          {risk.label}
        </span>
      </div>

      {/* Metrics */}
      <div className="px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-3">
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Profit Score</span>
            <span className="font-medium text-indigo-600">{(opp.profit_score * 100).toFixed(1)}%</span>
          </div>
          <Bar value={opp.profit_score} colorClass="bg-indigo-500" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Confidence</span>
            <span className="font-medium text-teal-600">{(opp.confidence * 100).toFixed(1)}%</span>
          </div>
          <Bar value={opp.confidence} colorClass="bg-teal-500" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Risk Score</span>
            <span className={`font-medium ${risk.text}`}>{(opp.risk_score * 100).toFixed(1)}%</span>
          </div>
          <Bar value={opp.risk_score} colorClass={risk.bar} />
        </div>
      </div>

      {/* Sportsbook table */}
      <div className="px-6 pb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left pb-1 font-medium">Book</th>
              <th className="text-right pb-1 font-medium">Odds</th>
              <th className="text-right pb-1 font-medium">Stake</th>
            </tr>
          </thead>
          <tbody>
            {opp.sportsbooks.map((sb) => (
              <tr key={sb.name} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 font-medium text-gray-800">{sb.name}</td>
                <td className="py-1.5 text-right text-gray-600">
                  {sb.odds > 0 ? `+${sb.odds}` : sb.odds}
                </td>
                <td className="py-1.5 text-right text-gray-600">${sb.stake.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: totals */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t border-gray-100">
        <span className="text-sm text-gray-500">
          Total Stake: <span className="font-semibold text-gray-800">${opp.total_stake.toLocaleString()}</span>
        </span>
        <span className="text-sm">
          Profit:{' '}
          <span className={`font-bold text-base ${opp.guaranteed_profit > 0 ? 'text-green-600' : 'text-gray-400'}`}>
            ${opp.guaranteed_profit.toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  )
}

export default function Arbitrage() {
  const [status, setStatus]   = useState('idle')
  const [results, setResults] = useState([])
  const [error, setError]     = useState(null)

  async function handleExecute() {
    setStatus('loading')
    setError(null)
    try {
      const data = await api.get('/arbitrage/opportunities')
      setResults(data)
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const confirmedArbs = results.filter((o) => o.profit_score > 0).length
  const valueBets     = results.length - confirmedArbs
  const totalProfit   = results.reduce((s, o) => s + o.guaranteed_profit, 0)

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-3xl mx-auto">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Arbitrage Opportunities</h1>
            <p className="text-sm text-gray-400 mt-1">ML-scored betting opportunities across markets</p>
          </div>
          <button
            onClick={handleExecute}
            disabled={status === 'loading'}
            className="px-8 py-3 rounded-lg bg-indigo-600 text-white font-semibold tracking-wide hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'loading' ? 'Running…' : results.length > 0 || status === 'done' ? 'Refresh' : 'Execute'}
          </button>
        </div>

        {/* Error */}
        {status === 'error' && (
          <p className="mb-6 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            Error: {error}
          </p>
        )}

        {/* Summary bar */}
        {status === 'done' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <StatChip label="Opportunities"  value={results.length} />
            <StatChip label="Confirmed Arbs" value={confirmedArbs}  valueClass="text-green-600" />
            <StatChip label="Value Bets"     value={valueBets}      valueClass="text-amber-600" />
            <StatChip label="Expected Profit" value={`$${totalProfit.toLocaleString()}`} valueClass="text-green-600" />
          </div>
        )}

        {/* Cards */}
        {results.length > 0 && (
          <div className="space-y-5">
            {results.map((opp, i) => (
              <OpportunityCard key={`${opp.market_type}-${i}`} opp={opp} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {status === 'done' && results.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No opportunities found</p>
            <p className="text-sm mt-1">No markets passed the confidence threshold.</p>
          </div>
        )}
      </div>
    </main>
  )
}
