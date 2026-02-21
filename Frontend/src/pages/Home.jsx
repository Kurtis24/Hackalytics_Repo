/* ────────────────────────────────────────────────────────────────
   Home — Landing page  (dark space aesthetic · Playfair Display)
   Globe hero with React Bits LightRays → How we do it → CTA
──────────────────────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react'
import LightRays from '../components/LightRays/LightRays'

const PF = { fontFamily: "'Playfair Display', Georgia, serif" }

// Analyze Market card content
function AnalyzeMarketCard() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      {/* Top section with title and text */}
      <div style={{
        padding: '32px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        position: 'relative',
        zIndex: 2,
      }}>

        <div style={{ maxWidth: '60%', paddingRight: '20px' }}>
          <h3 style={{
            ...PF,
            fontSize: '2rem',
            fontWeight: 400,
            color: '#fff',
            marginBottom: 20,
            letterSpacing: '0.01em',
          }}>
            Arbitrage
          </h3>
          <p style={{
            ...PF,
            fontSize: '0.95rem',
            color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.7,
            fontStyle: 'normal',
            fontWeight: 300,
          }}>
            Trade 70+ major, minor, and exotic<br />currency pairs with tight spreads<br />and real-time execution
          </p>
        </div>

        {/* Arbitrage visualization in top right */}
        <div style={{
          position: 'absolute',
          top: '32px',
          right: '32px',
          width: '320px',
          height: '180px',
          borderRadius: '12px',
          overflow: 'hidden',
          opacity: 0.9,
          pointerEvents: 'none',
          background: 'rgba(30, 58, 138, 0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          {/* Arbitrage triangle visualization */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="240" height="160" viewBox="0 0 200 140" style={{ opacity: 0.7 }}>
              {/* Triangle connecting three currency pairs */}
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Connection lines */}
              <line x1="100" y1="20" x2="40" y2="110" stroke="#3b82f6" strokeWidth="2" opacity="0.6" filter="url(#glow)" />
              <line x1="40" y1="110" x2="160" y2="110" stroke="#3b82f6" strokeWidth="2" opacity="0.6" filter="url(#glow)" />
              <line x1="160" y1="110" x2="100" y2="20" stroke="#3b82f6" strokeWidth="2" opacity="0.6" filter="url(#glow)" />

              {/* Currency nodes */}
              <circle cx="100" cy="20" r="8" fill="#3b82f6" filter="url(#glow)" />
              <circle cx="40" cy="110" r="8" fill="#3b82f6" filter="url(#glow)" />
              <circle cx="160" cy="110" r="8" fill="#3b82f6" filter="url(#glow)" />

              {/* Arrows */}
              <path d="M 65 65 L 60 70 L 70 70 Z" fill="#60a5fa" />
              <path d="M 100 65 L 95 60 L 95 70 Z" fill="#60a5fa" />
              <path d="M 135 65 L 140 70 L 130 70 Z" fill="#60a5fa" />
            </svg>
          </div>

          {/* Data overlay */}
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            right: '10px',
            fontSize: '9px',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>EUR/USD</span>
            <span>USD/JPY</span>
            <span>EUR/JPY</span>
          </div>
        </div>
      </div>

      {/* Smooth rounded stepped pattern at bottom */}
      <div style={{
        position: 'relative',
        height: '120px',
        marginTop: 'auto',
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="stepGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id="stepGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#dde4ed" />
            </linearGradient>
            <linearGradient id="stepGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#dde4ed" />
              <stop offset="100%" stopColor="#e8edf3" />
            </linearGradient>
          </defs>
          {/* Smooth rounded stepped paths with bezier curves */}
          {/* Step 3 (rightmost, tallest) */}
          <path
            d="M 0,100 L 0,60
               C 0,55 2,52 7,52
               L 26,52
               C 31,52 33,49 33,44
               L 33,35
               C 33,30 35,27 40,27
               L 59,27
               C 64,27 66,24 66,19
               L 66,5
               C 66,2 68,0 71,0
               L 100,0 L 100,100 Z"
            fill="url(#stepGradient3)"
          />
          {/* Step 2 (middle) */}
          <path
            d="M 0,100 L 0,60
               C 0,55 2,52 7,52
               L 26,52
               C 31,52 33,49 33,44
               L 33,35
               C 33,30 35,27 40,27
               L 59,27
               C 64,27 66,27 66,27
               L 66,100 Z"
            fill="url(#stepGradient2)"
          />
          {/* Step 1 (leftmost, shortest) */}
          <path
            d="M 0,100 L 0,60
               C 0,55 2,52 7,52
               L 26,52
               C 31,52 33,52 33,52
               L 33,100 Z"
            fill="url(#stepGradient1)"
          />
        </svg>
      </div>
    </div>
  )
}

// LLM Model card content
function LLMModelCard() {
  const lightBg = 'linear-gradient(180deg,rgb(223, 237, 253) 0%, #dbeafe 100%)'
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      background: lightBg,
    }}>
      {/* Smooth rounded stepped pattern at top with blue gradients */}
      <div style={{
        position: 'relative',
        height: '120px',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="stepGradientBlendLLM" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="25%" stopColor="#1e3a8a" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="75%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#bfdbfe" />
            </linearGradient>
          </defs>
          {/* Original stepped shape only — no full rect; path defines the blue gradient area */}
          <path
            d="M 0,0 L 0,40
               C 0,45 2,48 7,48
               L 26,48
               C 31,48 33,51 33,56
               L 33,65
               C 33,70 35,73 40,73
               L 59,73
               C 64,73 66,76 66,81
               L 66,95
               C 66,98 68,100 71,100
               L 100,100 L 100,0 Z"
            fill="url(#stepGradientBlendLLM)"
          />
        </svg>
      </div>

      {/* Main content section — same light blue so no white shows at edges */}
      <div style={{
        padding: '32px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        position: 'relative',
        zIndex: 2,
        background: lightBg,
      }}>
        

        <div style={{ maxWidth: '60%', paddingRight: '20px' }}>
          <h3 style={{
            ...PF,
            fontSize: '2rem',
            fontWeight: 400,
            color: '#1e3a8a',
            marginBottom: 20,
            letterSpacing: '0.01em',
          }}>
            LLM Model
          </h3>
          <p style={{
            ...PF,
            fontSize: '0.95rem',
            color: 'rgba(30,58,138,0.85)',
            lineHeight: 1.7,
            fontStyle: 'normal',
            fontWeight: 300,
          }}>
            Train AI to detect market  predict outcomes<br />before they occur
          </p>
        </div>

        <div style={{
          marginTop: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}>
          <button className="btn-card" onClick={() => onNav('product')}>
            View Model
          </button>
        </div>

        {/* Visualization in top right */}
        <div style={{
          position: 'absolute',
          top: '32px',
          right: '32px',
          width: '320px',
          height: '180px',
          borderRadius: '12px',
          overflow: 'hidden',
          opacity: 0.9,
          pointerEvents: 'none',
          background: 'rgba(30, 58, 138, 0.3)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
        }}>
          {/* Neural network visualization */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="240" height="160" viewBox="0 0 200 140" style={{ opacity: 0.7 }}>
              <defs>
                <filter id="glowLLM">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              {/* Neural network connections */}
              <line x1="40" y1="40" x2="100" y2="70" stroke="#3b82f6" strokeWidth="1.5" opacity="0.5" />
              <line x1="40" y1="100" x2="100" y2="70" stroke="#3b82f6" strokeWidth="1.5" opacity="0.5" />
              <line x1="100" y1="70" x2="160" y2="40" stroke="#3b82f6" strokeWidth="1.5" opacity="0.5" />
              <line x1="100" y1="70" x2="160" y2="100" stroke="#3b82f6" strokeWidth="1.5" opacity="0.5" />

              {/* Nodes */}
              <circle cx="40" cy="40" r="6" fill="#3b82f6" filter="url(#glowLLM)" />
              <circle cx="40" cy="100" r="6" fill="#3b82f6" filter="url(#glowLLM)" />
              <circle cx="100" cy="70" r="8" fill="#60a5fa" filter="url(#glowLLM)" />
              <circle cx="160" cy="40" r="6" fill="#3b82f6" filter="url(#glowLLM)" />
              <circle cx="160" cy="100" r="6" fill="#3b82f6" filter="url(#glowLLM)" />
            </svg>
          </div>

          {/* Data overlay */}
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            right: '10px',
            fontSize: '9px',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
            textAlign: 'center',
          }}>
            Neural Network
          </div>
        </div>
      </div>
    </div>
  )
}

const CARDS = [
  {
    id: 'analyze', variant: 'dark',
    title: 'Analyze Market',
    body:  'FI D mis matches within the market',
    visual: null,
    btn: null,
    customContent: <AnalyzeMarketCard />,
  },
  {
    id: 'llm', variant: 'light',
    title: 'LLM Model',
    body:  'Train AI to detect these and predict them for future out comes',
    visual: null,
    btn: 'View Model',
    customContent: <LLMModelCard />,
  },
  {
    id: 'execute', variant: 'dark',
    title: 'Execute Arb',
    body:  'Automatically size and place stakes across books at optimal volume',
    visual: null,
    btn: 'Try Now',
  },
]

export default function Home({ onNav }) {
  const [showViewMore, setShowViewMore] = useState(true)
  const [viewMoreFading, setViewMoreFading] = useState(false)
  const scrollRef = useRef(null)
  const fadeTimeoutRef = useRef(null)
  const [visibility, setVisibility] = useState({ how: 1, cta: 1 })
  const howRef = useRef(null)
  const ctaRef = useRef(null)
  const pendingRef = useRef({ how: 1, cta: 1 })
  const rafRef = useRef(null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.dataset.fadeSection
          if (!id) return
          pendingRef.current[id] = entry.intersectionRatio
        })
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            setVisibility({ ...pendingRef.current })
          })
        }
      },
      { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1], rootMargin: '0px 0px -5% 0px' }
    )
    const t = setTimeout(() => {
      if (howRef.current) obs.observe(howRef.current)
      if (ctaRef.current) obs.observe(ctaRef.current)
    }, 0)
    return () => {
      clearTimeout(t)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      obs.disconnect()
    }
  }, [])

  const handleScroll = (e) => {
    if (e.target.scrollLeft > 10) {
      setShowViewMore(false)
      setViewMoreFading(true)
    } else {
      setShowViewMore(true)
      setViewMoreFading(false)
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
        fadeTimeoutRef.current = null
      }
    }
  }

  useEffect(() => {
    if (!viewMoreFading) return
    fadeTimeoutRef.current = setTimeout(() => {
      setViewMoreFading(false)
      fadeTimeoutRef.current = null
    }, 1100)
    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
    }
  }, [viewMoreFading])

  return (
    <main style={{ background: '#000', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ─── HERO ──────────────────────────────────────────────── */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: '30vh',   /* push content down into the planet surface */
        paddingBottom: 40,
        overflow: 'hidden',
      }}>

        {/* Horizon arc — absolutely positioned, acting as the background */}
        <div className="globe-wrap">
          <div className="globe-body" />
          
          {/* Sunburst flare at the peak of the curve */}
          <div style={{
            position: 'absolute',
            top: '32vh', /* Match globe body peak */
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 120,
            background: 'radial-gradient(ellipse at center, rgba(59,130,246,0.65) 0%, rgba(37,99,235,0.35) 40%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 3,
            filter: 'blur(2px)',
          }} />
          <div style={{
            position: 'absolute',
            top: '32vh', /* Match globe body peak */
            left: '50%',
            transform: 'translateX(-50%)',
            width: '130vw', /* Exact same curve as the planet */
            height: '130vw',
            borderRadius: '50%',
            pointerEvents: 'none',
            zIndex: 4,
            borderTop: '3px solid #ffffff', /* Sharper, cleaner, thinner white line */
            boxShadow: '0 -2px 15px 3px rgba(255,255,255,0.9), inset 0 2px 15px 3px rgba(255,255,255,0.9)', /* Tighter, more intense glow */
            filter: 'blur(1px)', /* Much less blur so the line is crisp */
            /* Mask to fade out the white reflection sharply on the sides - widened to make the line longer */
            WebkitMaskImage: 'linear-gradient(90deg, transparent 38%, black 46%, black 54%, transparent 62%)',
            maskImage: 'linear-gradient(90deg, transparent 38%, black 46%, black 54%, transparent 62%)',
          }} />
        </div>

        {/* LightRays — shining downwards onto the horizon line */}
        <div style={{
          position: 'absolute',
          top: 0, 
          left: 0,
          right: 0,
          bottom: 0, /* Beams span the whole screen down to the reflection point */
          zIndex: 4,
          pointerEvents: 'none',
        }}>
          <LightRays
            raysOrigin="top-center"
            raysColor="#b0d8ff"
            raysSpeed={0.08}
            lightSpread={0.12}
            rayLength={3.2}
            fadeDistance={2.2}
            saturation={1.3}
            pulsating={false}
            followMouse={true}
            mouseInfluence={0.08}
            noiseAmount={0}
            distortion={0}
          />
        </div>

        {/* Headline */}
        <h1 style={{
          ...PF,
          fontSize: 'clamp(2.5rem, 5.5vw, 3.8rem)', 
          fontWeight: 500,
          fontStyle: 'italic', 
          textAlign: 'center',
          lineHeight: 1.15,
          letterSpacing: '0.01em',
          color: '#fff',
          maxWidth: 680, 
          margin: '0 auto 32px', /* Starts right below the 36vh padding (inside the planet) */
          position: 'relative',
          zIndex: 5,
        }}>
          AI That finds arbitrage<br />and invests
        </h1>

        {/* CTA */}
        <button
          className="btn-outline"
          style={{ ...PF, zIndex: 5, position: 'relative' }}
          onClick={() => onNav('product')}
        >
          Try Now
        </button>

        {/* T-shaped connector: vertical stem down, then horizontal line (no flip) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 40,
          position: 'relative',
          zIndex: 5,
        }}>
          <div style={{
            width: 1,
            height: 48,
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0.6))',
            boxShadow: '0 0 8px rgba(255,255,255,0.35)',
          }} />
          <div style={{
            width: 320,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8) 50%, transparent)',
            boxShadow: '0 0 10px rgba(255,255,255,0.3)',
          }} />
        </div>

        {/* Fade to black at bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '200px',
          background: 'linear-gradient(to bottom, transparent 0%, #000 100%)',
          pointerEvents: 'none',
          zIndex: 6,
        }} />
      </section>

      {/* ─── HOW WE DO IT ──────────────────────────────────────── */}
      <section
        ref={howRef}
        data-fade-section="how"
        style={{
          padding: '30px 0 80px',
          background: '#000',
          opacity: visibility.how,
          transform: `translateY(${16 * (1 - visibility.how)}px)`,
          transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
        }}
      >

        <h2 style={{
          ...PF,
          textAlign: 'center',
          fontSize: '2.3rem',
          fontWeight: 400,
          color: '#fff',
          letterSpacing: '0.02em',
          marginBottom: 40,
        }}>
          How we do it
        </h2>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>

          {/* "View More" side label — words fade right-to-left when cards scroll over */}
          {(showViewMore || viewMoreFading) && (
            <div style={{
              position: 'absolute', left: 24, top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16,
              paddingRight: '200px',
              pointerEvents: viewMoreFading ? 'none' : 'auto',
            }}>
              {/* Row 1: "View" and "More" — fade right to left so "More" first, then "View" */}
              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 0 }}>
                <span style={{
                  ...PF,
                  fontSize: '2rem',
                  color: viewMoreFading ? '#000' : 'rgba(255, 255, 255, 0.8)',
                  transition: 'opacity 0.5s ease, color 0.5s ease',
                  transitionDelay: viewMoreFading ? '0.25s' : '0s',
                  opacity: viewMoreFading ? 0 : 1,
                }}>View</span>
                <span style={{
                  ...PF,
                  fontSize: '2rem',
                  color: viewMoreFading ? '#000' : 'rgba(255, 255, 255, 0.8)',
                  transition: 'opacity 0.5s ease, color 0.5s ease',
                  transitionDelay: viewMoreFading ? '0s' : '0s',
                  opacity: viewMoreFading ? 0 : 1,
                }}>  More</span>
              </div>
              <span style={{
                fontSize: '2.5rem',
                color: viewMoreFading ? '#000' : 'rgba(255, 255, 255, 0.7)',
                lineHeight: 1,
                transition: 'opacity 0.5s ease, color 0.5s ease',
                transitionDelay: viewMoreFading ? '0.5s' : '0s',
                opacity: viewMoreFading ? 0 : 0.9,
              }}>←</span>
            </div>
          )}

          {/* Scrollable card strip */}
          <div
            ref={scrollRef}
            className="no-scrollbar"
            onScroll={handleScroll}
            style={{
              display: 'flex', gap: 20, overflowX: 'auto',
              paddingLeft: 280, paddingRight: 48,
              paddingTop: 8, paddingBottom: 16, width: '100%',
            }}>
            {CARDS.map(card => (
              <div
                key={card.id}
                className={`how-card how-card-${card.variant}`}
                style={{
                  minWidth: card.id === 'analyze' || card.id === 'llm' ? '60%' : 300,
                  flexShrink: card.id === 'analyze' || card.id === 'llm' ? 0 : 1,
                  minHeight: card.id === 'analyze' || card.id === 'llm' ? '340px' : 'auto',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                {card.customContent ? (
                  card.customContent
                ) : (
                  <>
                    {card.visual && (
                      <div style={{ padding: '16px 16px 0' }}>{card.visual}</div>
                    )}
                    <div style={{ padding: card.visual ? '16px 20px 20px' : '32px 20px 24px' }}>
                      <h3 style={{
                        ...PF,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: card.variant === 'dark' ? '#fff' : '#0f172a',
                        marginBottom: 8,
                      }}>
                        {card.title}
                      </h3>
                      <p style={{
                        ...PF,
                        fontSize: '0.82rem',
                        color: card.variant === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.75)',
                        lineHeight: 1.6,
                        marginBottom: card.btn ? 20 : 0,
                        fontStyle: 'italic',
                      }}>
                        {card.body}
                      </p>
                      {card.btn && (
                        <button
                          className="btn-card"
                          style={card.variant === 'light' ? { background: '#1f2937', color: '#fff', ...PF } : PF}
                          onClick={() => onNav('product')}
                        >
                          {card.btn}
                          <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>▶</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── JOIN CTA ──────────────────────────────────────────── */}
      <section
        ref={ctaRef}
        data-fade-section="cta"
        style={{
          position: 'relative',
          padding: '80px 24px 160px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36,
          overflow: 'hidden', background: '#000',
          opacity: visibility.cta,
          transform: `translateY(${16 * (1 - visibility.cta)}px)`,
          transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
        }}
      >
        <h2 style={{
          ...PF,
          fontSize: 'clamp(2.2rem, 6vw, 3.8rem)',
          fontWeight: 700,
          color: '#fff',
          textAlign: 'center',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          maxWidth: 520,
          zIndex: 2, position: 'relative',
        }}>
          Join the Untapped<br />Market
        </h2>

        <button
          className="btn-dark"
          style={{ ...PF, zIndex: 2, position: 'relative' }}
          onClick={() => onNav('product')}
        >
          Try Now
        </button>

        {/* Wave glow layers */}
        <div className="wave-container">
          <div className="wave wave-1" />
          <div className="wave wave-2" />
          <div className="wave wave-3" />
          <div style={{
            position: 'absolute', bottom: -60, left: '50%',
            transform: 'translateX(-50%)',
            width: '90%', height: 180,
            background: 'radial-gradient(ellipse at 50% 100%, rgba(37,99,235,0.45) 0%, transparent 70%)',
            filter: 'blur(18px)',
          }} />
        </div>
      </section>

    </main>
  )
}
