/* ────────────────────────────────────────────────────────────────
   Product — Arbitrage Opportunities  (dark space aesthetic · Playfair Display)
──────────────────────────────────────────────────────────────── */

import { useState } from 'react'
import { api } from '../services/api'

const PF = { fontFamily: "'Playfair Display', Georgia, serif" }

// ── Risk metadata ────────────────────────────────────────────
function riskMeta(score) {
  if (score <= 0.25) return { label: 'Low Risk',  color: '#22c55e', glow: 'rgba(34,197,94,0.3)'  }
  if (score <= 0.50) return { label: 'Moderate',  color: '#f59e0b', glow: 'rgba(245,158,11,0.3)' }
  if (score <= 0.75) return { label: 'Elevated',  color: '#f97316', glow: 'rgba(249,115,22,0.3)' }
  return               { label: 'High Risk',  color: '#ef4444', glow: 'rgba(239,68,68,0.3)'   }
}

// ── Thin progress bar ────────────────────────────────────────
function Bar({ value, color }) {
  return (
    <div style={{
      width: '100%',
      height: 3,
      borderRadius: 99,
      background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${Math.round(value * 100)}%`,
        background: color,
        borderRadius: 99,
        boxShadow: `0 0 6px 1px ${color}80`,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

// ── Summary stat chip ────────────────────────────────────────
function StatChip({ label, value, color = '#fff' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 14,
      padding: '14px 22px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      minWidth: 110,
    }}>
      <span style={{ fontSize: '1.35rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

// ── Diagnostic pill ──────────────────────────────────────────
function DiagPill({ label, value }) {
  return (
    <span style={{
      fontSize: '0.7rem',
      color: 'rgba(255,255,255,0.45)',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 99,
      padding: '2px 10px',
      whiteSpace: 'nowrap',
    }}>
      {label}: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{value}</strong>
    </span>
  )
}

// ── Opportunity card ─────────────────────────────────────────
function OpportunityCard({ opp }) {
  const risk      = riskMeta(opp.risk_score)
  const marketLbl = opp.market_type.replace(/_/g, ' ')
  const dateStr   = new Date(opp.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const binding = opp.market_ceiling <= opp.kelly_stake ? 'ceiling binds' : 'kelly binds'

  return (
    <div style={{
      background: 'linear-gradient(145deg, #0c1a35 0%, #080f20 100%)',
      border: '1px solid rgba(60,120,255,0.18)',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 4px 40px rgba(0,0,0,0.4)',
    }}>

      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: 'rgba(99,102,241,0.2)',
              color: '#818cf8',
              padding: '2px 8px',
              borderRadius: 6,
            }}>
              {opp.category}
            </span>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.5)',
              padding: '2px 8px',
              borderRadius: 6,
            }}>
              {marketLbl}
            </span>
          </div>
          <p style={{ ...PF, fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: 0 }}>
            {opp.home_team}{' '}
            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>vs</span>{' '}
            {opp.away_team}
          </p>
          <p style={{ ...PF, fontSize: '0.72rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{dateStr}</p>
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: '0.72rem',
          fontWeight: 600,
          padding: '4px 12px',
          borderRadius: 999,
          background: `${risk.glow}`,
          color: risk.color,
          border: `1px solid ${risk.color}50`,
        }}>
          {risk.label}
        </span>
      </div>

      {/* Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px 24px',
        padding: '18px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {[
          { label: 'Profit Score',  value: opp.profit_score,  color: '#818cf8' },
          { label: 'Confidence',    value: opp.confidence,    color: '#2dd4bf' },
          { label: 'Risk Score',    value: opp.risk_score,    color: risk.color },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{label}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{(value * 100).toFixed(1)}%</span>
            </div>
            <Bar value={value} color={color} />
          </div>
        ))}
      </div>

      {/* Sportsbooks */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Book', 'Odds', 'Stake'].map(h => (
                <th key={h} style={{
                  textAlign: h === 'Book' ? 'left' : 'right',
                  fontSize: '0.68rem',
                  color: 'rgba(255,255,255,0.3)',
                  fontWeight: 500,
                  paddingBottom: 6,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {opp.sportsbooks.map(sb => (
              <tr key={sb.name}>
                <td style={{ padding: '7px 0', fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{sb.name}</td>
                <td style={{ padding: '7px 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
                  {sb.odds > 0 ? `+${sb.odds}` : sb.odds}
                </td>
                <td style={{ padding: '7px 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', textAlign: 'right' }}>
                  ${sb.stake.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Diagnostics row */}
      <div style={{
        padding: '10px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <DiagPill label="line mvt"  value={opp.line_movement?.toFixed(4) ?? '—'} />
        <DiagPill label="ceiling"   value={`$${opp.market_ceiling?.toLocaleString() ?? '—'}`} />
        <DiagPill label="kelly"     value={`$${opp.kelly_stake?.toLocaleString() ?? '—'}`} />
        <DiagPill label="constraint" value={binding} />
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 24px',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)' }}>
          Volume:{' '}
          <strong style={{ color: '#fff' }}>
            ${(opp.optimal_volume ?? opp.total_stake ?? 0).toLocaleString()}
          </strong>
        </span>
        <span style={{ fontSize: '0.9rem' }}>
          Profit:{' '}
          <strong style={{
            fontSize: '1rem',
            color: opp.guaranteed_profit > 0 ? '#22c55e' : 'rgba(255,255,255,0.35)',
          }}>
            ${opp.guaranteed_profit.toLocaleString()}
          </strong>
        </span>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────
export default function Arbitrage() {
  const [status,  setStatus]  = useState('idle')
  const [results, setResults] = useState([])
  const [error,   setError]   = useState(null)

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

  const confirmedArbs = results.filter(o => o.profit_score > 0).length
  const totalProfit   = results.reduce((s, o) => s + o.guaranteed_profit, 0)
  const totalVolume   = results.reduce((s, o) => s + (o.optimal_volume ?? o.total_stake ?? 0), 0)

  return (
    <main style={{
      background: '#000',
      minHeight: '100vh',
      padding: '100px 24px 80px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          marginBottom: 36,
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              ...PF,
              fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
              fontWeight: 700,
              fontStyle: 'italic',
              color: '#fff',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              Arbitrage Opportunities
            </h1>
            <p style={{ ...PF, fontSize: '0.82rem', color: 'rgba(255,255,255,0.35)', marginTop: 6, fontStyle: 'italic' }}>
              ML-scored markets · Volume-optimized stakes
            </p>
          </div>

          <button
            onClick={handleExecute}
            disabled={status === 'loading'}
            className="btn-dark"
            style={{
              ...PF,
              opacity: status === 'loading' ? 0.5 : 1,
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'loading' ? 'Scanning…' : results.length > 0 ? 'Refresh' : 'Execute'}
          </button>
        </div>

        {/* ── Error ── */}
        {status === 'error' && (
          <div style={{
            marginBottom: 24,
            padding: '12px 18px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12,
            color: '#fca5a5',
            fontSize: '0.82rem',
          }}>
            Error: {error}
          </div>
        )}

        {/* ── Summary chips ── */}
        {status === 'done' && (
          <div style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 36,
          }}>
            <StatChip label="Opportunities"   value={results.length} />
            <StatChip label="Confirmed Arbs"  value={confirmedArbs}  color="#22c55e" />
            <StatChip label="Value Bets"      value={results.length - confirmedArbs} color="#f59e0b" />
            <StatChip label="Capital Required" value={`$${totalVolume.toLocaleString()}`} color="#818cf8" />
            <StatChip label="Expected Profit"  value={`$${totalProfit.toLocaleString()}`} color="#22c55e" />
          </div>
        )}

        {/* ── Cards ── */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {results.map((opp, i) => (
              <OpportunityCard key={`${opp.market_type}-${i}`} opp={opp} />
            ))}
          </div>
        )}

        {/* ── Empty / idle states ── */}
        {status === 'done' && results.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '80px 0',
            color: 'rgba(255,255,255,0.25)',
          }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 500 }}>No opportunities found</p>
            <p style={{ fontSize: '0.8rem', marginTop: 6 }}>No markets passed the confidence threshold.</p>
          </div>
        )}

        {status === 'idle' && (
          <div style={{
            textAlign: 'center',
            padding: '80px 0',
            color: 'rgba(255,255,255,0.2)',
            fontSize: '0.85rem',
          }}>
            Press <strong style={{ color: 'rgba(255,255,255,0.45)' }}>Execute</strong> to scan for arbitrage opportunities.
          </div>
        )}
      </div>
    </main>
  )
}
