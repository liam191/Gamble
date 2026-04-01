'use client'

interface Props {
  rollUnder: number
  onRollUnderChange: (val: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

export function Roulette({ rollUnder, onRollUnderChange, result, isLocked, isRolling }: Props) {
  const winChance = rollUnder
  const multiplier = ((100 - 4) / rollUnder).toFixed(2)

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-6)', padding: 'var(--space-6) 0' }}>
      {/* Result display */}
      <div style={{ height: '112px' }} className="flex items-center justify-center">
        {isRolling ? (
          <div className="animate-shimmer" style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: 'var(--accent-gold)',
            fontFamily: 'var(--font-heading)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            ??
          </div>
        ) : result !== null ? (
          <div className="animate-result" style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '3.5rem',
              fontWeight: 800,
              color: result < rollUnder ? 'var(--win)' : 'var(--lose)',
              fontFamily: 'var(--font-heading)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {result}
            </div>
            <div style={{
              fontSize: '0.8125rem',
              marginTop: 'var(--space-1)',
              color: result < rollUnder ? 'var(--win)' : 'var(--lose)',
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
          {/* Result marker */}
          {result !== null && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                height: '100%',
                width: '3px',
                background: 'var(--accent-gold)',
                boxShadow: '0 0 12px var(--accent-gold)',
                transition: 'left 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                left: `${result}%`,
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
