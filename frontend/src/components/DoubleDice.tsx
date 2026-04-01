'use client'

import { DICE_FACES } from '@/lib/constants'

interface Props {
  mask: number
  onMaskChange: (mask: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

const SUMS: { sum: number; outcomes: number[]; count: number }[] = (() => {
  const map: Record<number, number[]> = {}
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const sum = i + j + 2
      if (!map[sum]) map[sum] = []
      map[sum].push(i * 6 + j)
    }
  }
  return Object.entries(map).map(([sum, outcomes]) => ({
    sum: Number(sum),
    outcomes,
    count: outcomes.length,
  }))
})()

function hasBit36(mask: number, bit: number): boolean {
  return Math.floor(mask / (2 ** bit)) % 2 === 1
}

function maskForSum(sum: number): number {
  const entry = SUMS.find(s => s.sum === sum)
  if (!entry) return 0
  let m = 0
  for (const o of entry.outcomes) m += 2 ** o
  return m
}

function toggleSum(currentMask: number, sum: number): number {
  const sumMask = maskForSum(sum)
  const allSet = SUMS.find(s => s.sum === sum)?.outcomes.every(o => hasBit36(currentMask, o)) ?? false
  if (allSet) {
    return currentMask - sumMask
  }
  let result = currentMask
  for (const o of (SUMS.find(s => s.sum === sum)?.outcomes ?? [])) {
    if (!hasBit36(result, o)) result += 2 ** o
  }
  return result
}

function selectedSums(mask: number): number[] {
  return SUMS.filter(s => {
    return s.outcomes.every(o => hasBit36(mask, o))
  }).map(s => s.sum)
}

function popcount36(mask: number): number {
  let count = 0
  for (let i = 0; i < 36; i++) {
    if (hasBit36(mask, i)) count++
  }
  return count
}

export function DoubleDice({ mask, onMaskChange, result, isLocked, isRolling }: Props) {
  const die1 = result !== null ? Math.floor(result / 6) : null
  const die2 = result !== null ? result % 6 : null
  const resultSum = die1 !== null && die2 !== null ? die1 + die2 + 2 : null
  const selected = selectedSums(mask)
  const totalSelected = popcount36(mask)

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-5)', padding: 'var(--space-4) 0' }}>
      {/* Dice display */}
      <div style={{ height: '96px' }} className="flex items-center justify-center" >
        {isRolling ? (
          <div className="flex items-center" style={{ gap: 'var(--space-4)' }}>
            <div className="animate-dice-tumble" style={{ fontSize: '2.75rem' }}>🎲</div>
            <div className="animate-dice-tumble" style={{ fontSize: '2.75rem', animationDelay: '0.15s' }}>🎲</div>
          </div>
        ) : die1 !== null && die2 !== null ? (
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <div className="animate-dice-land" style={{ fontSize: '2.75rem' }}>{DICE_FACES[die1]}</div>
            <div className="animate-fade-in" style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 700, animationDelay: '0.2s' }}>+</div>
            <div className="animate-dice-land" style={{ fontSize: '2.75rem', animationDelay: '0.1s' }}>{DICE_FACES[die2]}</div>
            <div className="animate-fade-in" style={{ fontSize: '1.25rem', color: 'var(--text-muted)', fontWeight: 700, animationDelay: '0.3s' }}>=</div>
            <div className="animate-result" style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--accent-gold)',
              fontFamily: 'var(--font-heading)',
              fontVariantNumeric: 'tabular-nums',
              textShadow: '0 0 16px oklch(78% 0.16 85 / 0.4)',
              animationDelay: '0.35s',
            }}>{resultSum}</div>
          </div>
        ) : (
          <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
            <div style={{ fontSize: '2.75rem', opacity: 0.2 }}>🎲</div>
            <div style={{ fontSize: '2.75rem', opacity: 0.2 }}>🎲</div>
          </div>
        )}
      </div>

      {/* Sum selection grid */}
      <div style={{ width: '100%' }}>
        <div style={{
          fontSize: '0.6875rem',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-2)',
          textAlign: 'center',
        }}>
          Select sums (2-12)
        </div>
        <div className="flex flex-wrap justify-center" style={{ gap: 'var(--space-2)' }}>
          {SUMS.map(({ sum, count }) => {
            const isSelected = selected.includes(sum)
            const isResult = resultSum === sum
            return (
              <button
                key={sum}
                onClick={() => onMaskChange(toggleSum(mask, sum))}
                disabled={isLocked}
                style={{
                  width: '48px',
                  height: '56px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-heading)',
                  background: isResult
                    ? 'var(--accent-gold)'
                    : isSelected
                    ? 'var(--win)'
                    : 'var(--surface-3)',
                  color: isResult
                    ? 'oklch(15% 0.02 85)'
                    : isSelected
                    ? 'oklch(15% 0.02 155)'
                    : 'var(--text-primary)',
                  border: isResult || isSelected ? 'none' : '1px solid var(--surface-4)',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.5 : 1,
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  transform: isResult ? 'scale(1.1)' : isSelected ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isResult ? 'var(--shadow-gold)' : isSelected ? '0 4px 16px oklch(72% 0.18 155 / 0.3)' : 'none',
                }}
              >
                <span>{sum}</span>
                <span style={{ fontSize: '0.5625rem', opacity: 0.7 }}>{count}/36</span>
              </button>
            )
          })}
        </div>
      </div>

      {totalSelected > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Selected: {selected.join(', ')} ({totalSelected}/36 chance = {((totalSelected / 36) * 100).toFixed(1)}%)
        </div>
      )}
    </div>
  )
}
