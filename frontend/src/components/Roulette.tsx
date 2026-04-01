'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  rollUnder: number
  onRollUnderChange: (val: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

/* Rapidly cycling number display during rolling */
function ScanningNumber({ isRolling }: { isRolling: boolean }) {
  const [display, setDisplay] = useState(50)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRolling) {
      let speed = 50
      const tick = () => {
        setDisplay(Math.floor(Math.random() * 100))
      }
      intervalRef.current = setInterval(tick, speed)

      /* Slow down over time for tension */
      const slow1 = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(tick, 100)
      }, 2000)
      const slow2 = setTimeout(() => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(tick, 180)
      }, 4000)

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
        clearTimeout(slow1)
        clearTimeout(slow2)
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRolling])

  if (!isRolling) return null

  return (
    <div style={{
      fontSize: '3rem',
      fontWeight: 800,
      color: 'var(--accent-gold)',
      fontFamily: 'var(--font-heading)',
      fontVariantNumeric: 'tabular-nums',
      textShadow: '0 0 20px oklch(78% 0.16 85 / 0.5)',
      minWidth: '80px',
      textAlign: 'center',
    }}>
      {display}
    </div>
  )
}

export function Roulette({ rollUnder, onRollUnderChange, result, isLocked, isRolling }: Props) {
  const winChance = rollUnder
  const multiplier = ((100 - 4) / rollUnder).toFixed(2)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    if (result !== null) {
      setShowResult(false)
      const t = setTimeout(() => setShowResult(true), 100)
      return () => clearTimeout(t)
    }
    setShowResult(false)
  }, [result])

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-6)', padding: 'var(--space-6) 0' }}>
      {/* Result display */}
      <div style={{ height: '112px' }} className="flex items-center justify-center">
        {isRolling ? (
          <ScanningNumber isRolling={isRolling} />
        ) : result !== null && showResult ? (
          <div className="animate-result" style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '3.5rem',
              fontWeight: 800,
              color: result < rollUnder ? 'var(--win)' : 'var(--lose)',
              fontFamily: 'var(--font-heading)',
              fontVariantNumeric: 'tabular-nums',
              textShadow: result < rollUnder
                ? '0 0 24px oklch(72% 0.18 155 / 0.5)'
                : '0 0 24px oklch(62% 0.2 25 / 0.5)',
            }}>
              {result}
            </div>
            <div style={{
              fontSize: '0.8125rem',
              marginTop: 'var(--space-1)',
              color: result < rollUnder ? 'var(--win)' : 'var(--lose)',
              fontWeight: 600,
            }}>
              {result < rollUnder ? `< ${rollUnder} — You Win!` : `≥ ${rollUnder} — You Lose`}
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-heading)',
            fontVariantNumeric: 'tabular-nums',
            opacity: 0.3,
          }}>
            00
          </div>
        )}
      </div>

      {/* Slider */}
      <div style={{ width: '100%', padding: '0 var(--space-4)' }}>
        {/* Visual bar */}
        <div style={{
          position: 'relative',
          height: '32px',
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'var(--surface-3)',
          marginBottom: 'var(--space-3)',
        }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              background: 'linear-gradient(90deg, var(--win-dim), var(--win))',
              transition: 'width 0.2s ease-out',
              width: `${rollUnder}%`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              height: '100%',
              background: 'linear-gradient(90deg, var(--lose), var(--lose-dim))',
              transition: 'width 0.2s ease-out',
              width: `${100 - rollUnder}%`,
            }}
          />
          {/* Result marker with bounce */}
          {result !== null && (
            <div
              className={showResult ? 'animate-ball-bounce' : ''}
              style={{
                position: 'absolute',
                top: '50%',
                marginTop: '-8px',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, oklch(95% 0.01 85) 0%, var(--accent-gold) 60%, var(--accent-gold-dim) 100%)',
                boxShadow: '0 0 12px var(--accent-gold), 0 2px 4px oklch(0% 0 0 / 0.4)',
                transition: 'left 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                left: `calc(${result}% - 8px)`,
                zIndex: 2,
              }}
            />
          )}
          {/* Threshold line */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              height: '100%',
              width: '2px',
              background: 'oklch(93% 0.01 270 / 0.8)',
              left: `${rollUnder}%`,
              zIndex: 1,
            }}
          />
        </div>

        {/* Slider input */}
        <input
          type="range"
          min={5}
          max={95}
          value={rollUnder}
          onChange={(e) => onRollUnderChange(Number(e.target.value))}
          disabled={isLocked}
          className="w-full"
          style={{
            height: '8px',
            borderRadius: '4px',
            appearance: 'none',
            background: 'var(--surface-3)',
            cursor: isLocked ? 'not-allowed' : 'pointer',
            opacity: isLocked ? 0.5 : 1,
            accentColor: 'var(--accent-gold)',
          }}
        />

        {/* Stats */}
        <div className="flex justify-between" style={{ marginTop: 'var(--space-3)', fontSize: '0.8125rem' }}>
          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Win Chance</div>
            <div style={{ fontWeight: 700, color: 'var(--win)', fontVariantNumeric: 'tabular-nums' }}>{winChance}%</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Roll Under</div>
            <div style={{
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontSize: '1.125rem',
              fontFamily: 'var(--font-heading)',
              fontVariantNumeric: 'tabular-nums',
            }}>{rollUnder}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>Multiplier</div>
            <div style={{ fontWeight: 700, color: 'var(--accent-gold)', fontVariantNumeric: 'tabular-nums' }}>{multiplier}x</div>
          </div>
        </div>
      </div>
    </div>
  )
}
