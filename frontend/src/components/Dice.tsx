'use client'

import { DICE_FACES } from '@/lib/constants'
import { toggleDiceBit, selectedFaces } from '@/lib/utils'

interface Props {
  mask: number
  onMaskChange: (mask: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

export function Dice({ mask, onMaskChange, result, isLocked, isRolling }: Props) {
  const selected = selectedFaces(mask)

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-6)', padding: 'var(--space-8) 0' }}>
      {/* Result display */}
      <div style={{ height: '96px' }} className="flex items-center justify-center">
        {isRolling ? (
          <div className="animate-shimmer" style={{ fontSize: '3.5rem' }}>🎲</div>
        ) : result !== null ? (
          <div className="animate-result" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3.5rem' }}>{DICE_FACES[result]}</div>
            <div style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
              Rolled {result + 1}!
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '3.5rem', opacity: 0.2 }}>🎲</div>
        )}
      </div>

      {/* Dice selection grid */}
      <div className="grid grid-cols-3" style={{ gap: 'var(--space-3)' }}>
        {DICE_FACES.map((face, i) => {
          const isSelected = !!(mask & (1 << i))
          return (
            <button
              key={i}
              onClick={() => onMaskChange(toggleDiceBit(mask, i))}
              disabled={isLocked}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-md)',
                fontSize: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected
                  ? 'linear-gradient(180deg, var(--win) 0%, var(--win-dim) 100%)'
                  : 'linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%)',
                color: isSelected ? 'oklch(15% 0.02 155)' : 'var(--text-primary)',
                border: isSelected ? '2px solid oklch(100% 0 0 / 0.15)' : '1px solid var(--surface-4)',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.5 : 1,
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                boxShadow: isSelected ? '0 4px 20px oklch(72% 0.18 155 / 0.35)' : 'var(--shadow-inset)',
              }}
            >
              {face}
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Selected: {selected.join(', ')} ({selected.length}/6 chance)
        </div>
      )}
    </div>
  )
}
