'use client'

import { useState, useEffect } from 'react'

interface Props {
  selected: number
  onSelect: (mask: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

export function CoinFlip({ selected, onSelect, result, isLocked, isRolling }: Props) {
  const [showSettle, setShowSettle] = useState(false)
  const [prevResult, setPrevResult] = useState<number | null>(null)

  useEffect(() => {
    if (result !== null && result !== prevResult) {
      setShowSettle(true)
      setPrevResult(result)
      const t = setTimeout(() => setShowSettle(false), 700)
      return () => clearTimeout(t)
    }
    if (result === null) {
      setPrevResult(null)
      setShowSettle(false)
    }
  }, [result, prevResult])

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-8)', padding: 'var(--space-8) 0' }}>
      {/* 3D Coin display */}
      <div style={{ height: '110px', perspective: '600px' }} className="flex items-center justify-center">
        {isRolling ? (
          /* Spinning 3D coin */
          <div style={{ perspective: '600px' }}>
            <div
              className="animate-coin-flip"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent-gold-bright) 0%, var(--accent-gold) 40%, var(--accent-gold-dim) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                boxShadow: '0 0 30px var(--accent-gold-glow), inset 0 -3px 6px oklch(0% 0 0 / 0.2), inset 0 2px 4px oklch(100% 0 0 / 0.3)',
                border: '3px solid oklch(85% 0.12 85)',
              }}
            >
              🪙
            </div>
          </div>
        ) : result !== null ? (
          <div className={showSettle ? 'animate-coin-settle' : ''} style={{ textAlign: 'center', perspective: '600px' }}>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: result === 0
                  ? 'linear-gradient(135deg, var(--accent-gold-bright) 0%, var(--accent-gold) 50%, var(--accent-gold-dim) 100%)'
                  : 'linear-gradient(135deg, oklch(55% 0.18 290) 0%, oklch(45% 0.15 290) 50%, oklch(35% 0.12 290) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                margin: '0 auto',
                boxShadow: result === 0
                  ? '0 0 30px oklch(78% 0.16 85 / 0.4), 0 4px 12px oklch(0% 0 0 / 0.3)'
                  : '0 0 30px oklch(45% 0.15 290 / 0.4), 0 4px 12px oklch(0% 0 0 / 0.3)',
                border: result === 0 ? '3px solid oklch(85% 0.12 85)' : '3px solid oklch(60% 0.15 290)',
              }}
            >
              {result === 0 ? '👑' : '🌙'}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)', fontWeight: 600 }}>
              {result === 0 ? 'Heads!' : 'Tails!'}
            </div>
          </div>
        ) : (
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'var(--surface-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              opacity: 0.25,
              border: '3px solid var(--surface-4)',
            }}
          >
            🪙
          </div>
        )}
      </div>
      <div className="flex" style={{ gap: 'var(--space-4)' }}>
        {[
          { mask: 1, label: '👑 Heads', activeBg: 'linear-gradient(180deg, var(--accent-gold-bright) 0%, var(--accent-gold) 100%)' },
          { mask: 2, label: '🌙 Tails', activeBg: 'linear-gradient(180deg, oklch(50% 0.17 290) 0%, oklch(40% 0.15 290) 100%)' },
        ].map(({ mask, label, activeBg }) => (
          <button
            key={mask}
            onClick={() => onSelect(mask)}
            disabled={isLocked}
            style={{
              padding: 'var(--space-4) var(--space-8)',
              borderRadius: 'var(--radius-lg)',
              fontSize: '1rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              background: selected === mask
                ? activeBg
                : 'var(--surface-3)',
              color: selected === mask
                ? (mask === 1 ? 'oklch(15% 0.02 85)' : 'oklch(93% 0.01 290)')
                : 'var(--text-primary)',
              border: selected === mask
                ? '2px solid oklch(100% 0 0 / 0.15)'
                : '1px solid var(--surface-4)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: selected === mask ? 'scale(1.06)' : 'scale(1)',
              boxShadow: selected === mask
                ? (mask === 1 ? 'var(--shadow-gold-lg)' : '0 0 24px oklch(45% 0.15 290 / 0.3)')
                : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
