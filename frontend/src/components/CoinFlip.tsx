'use client'

interface Props {
  selected: number
  onSelect: (mask: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

export function CoinFlip({ selected, onSelect, result, isLocked, isRolling }: Props) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-8)', padding: 'var(--space-8) 0' }}>
      <div style={{ height: '96px' }} className="flex items-center justify-center">
        {isRolling ? (
          <div className="animate-gentle-spin" style={{ fontSize: '3.5rem' }}>🪙</div>
        ) : result !== null ? (
          <div className="animate-result" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem' }}>{result === 0 ? '👑' : '🌙'}</div>
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
              {result === 0 ? 'Heads!' : 'Tails!'}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '3.5rem', opacity: 0.2 }}>🪙</div>
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
