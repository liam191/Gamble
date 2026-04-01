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
          { mask: 1, label: '👑 Heads', activeColor: 'var(--accent-gold)' },
          { mask: 2, label: '🌙 Tails', activeBg: 'oklch(45% 0.15 290)' },
        ].map(({ mask, label, activeColor, activeBg }) => (
          <button
            key={mask}
            onClick={() => onSelect(mask)}
            disabled={isLocked}
            style={{
              padding: 'var(--space-4) var(--space-8)',
              borderRadius: 'var(--radius-md)',
              fontSize: '1rem',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              background: selected === mask
                ? (activeBg || activeColor || 'var(--accent-gold)')
                : 'var(--surface-3)',
              color: selected === mask
                ? (mask === 1 ? 'oklch(15% 0.02 85)' : 'oklch(93% 0.01 290)')
                : 'var(--text-primary)',
              border: selected === mask
                ? 'none'
                : '1px solid var(--surface-4)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: selected === mask ? 'scale(1.05)' : 'scale(1)',
              boxShadow: selected === mask ? 'var(--shadow-gold)' : 'none',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
