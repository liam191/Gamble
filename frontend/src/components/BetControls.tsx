'use client'

import { BET_OPTIONS } from '@/lib/constants'

export type BetState =
  | 'idle'
  | 'fetching'
  | 'wallet'
  | 'pending'
  | 'waiting'
  | 'won'
  | 'lost'

interface Props {
  betAmount: string
  onBetAmountChange: (val: string) => void
  potentialWinETH: string | null
  state: BetState
  canBet: boolean
  onPlaceBet: () => void
}

const STATE_LABELS: Record<BetState, string> = {
  idle: 'Place Bet',
  fetching: 'Getting ticket...',
  wallet: 'Confirm in wallet...',
  pending: 'Placing bet...',
  waiting: 'Rolling...',
  won: 'Play Again',
  lost: 'Play Again',
}

export function BetControls({
  betAmount,
  onBetAmountChange,
  potentialWinETH,
  state,
  canBet,
  onPlaceBet,
}: Props) {
  const isActive = state !== 'idle' && state !== 'won' && state !== 'lost'

  const getButtonStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      width: '100%',
      padding: 'var(--space-4)',
      borderRadius: 'var(--radius-md)',
      fontSize: '1rem',
      fontWeight: 700,
      border: 'none',
      cursor: 'pointer',
      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      fontFamily: 'var(--font-heading)',
      letterSpacing: '0.02em',
    }

    if (state === 'won') {
      return { ...base, background: 'var(--win)', color: 'oklch(15% 0.02 155)' }
    }
    if (state === 'lost') {
      return { ...base, background: 'var(--lose)', color: 'oklch(95% 0.01 25)' }
    }
    if (isActive) {
      return { ...base, background: 'var(--accent-gold)', color: 'oklch(15% 0.02 85)', cursor: 'wait' }
    }
    if (canBet) {
      return { ...base, background: 'var(--action)', color: 'var(--text-primary)' }
    }
    return { ...base, background: 'var(--surface-3)', color: 'var(--text-muted)', cursor: 'not-allowed' }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-5)',
        background: 'var(--surface-1)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--surface-3)',
      }}
    >
      {/* Bet amount */}
      <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', minWidth: '28px' }}>
          Bet
        </span>
        <div className="flex" style={{ gap: 'var(--space-2)' }}>
          {BET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onBetAmountChange(opt.value)}
              disabled={isActive}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: betAmount === opt.value ? '1px solid var(--accent-gold-dim)' : '1px solid var(--surface-4)',
                background: betAmount === opt.value ? 'var(--surface-3)' : 'var(--surface-2)',
                color: betAmount === opt.value ? 'var(--accent-gold)' : 'var(--text-secondary)',
                cursor: isActive ? 'not-allowed' : 'pointer',
                opacity: isActive ? 0.5 : 1,
                transition: 'all 0.2s ease-out',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview win */}
      {potentialWinETH && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Potential win:{' '}
          <span style={{ color: 'var(--win)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {potentialWinETH} ETH
          </span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'var(--space-1)', fontSize: '0.75rem' }}>
            (paid in UP)
          </span>
        </div>
      )}

      {/* Result message */}
      {state === 'won' && (
        <div className="animate-result" style={{
          textAlign: 'center',
          color: 'var(--win)',
          fontWeight: 700,
          fontSize: '1.125rem',
          fontFamily: 'var(--font-heading)',
        }}>
          You won!
        </div>
      )}
      {state === 'lost' && (
        <div className="animate-result" style={{
          textAlign: 'center',
          color: 'var(--lose)',
          fontWeight: 700,
          fontSize: '1.125rem',
          fontFamily: 'var(--font-heading)',
        }}>
          Better luck next time
        </div>
      )}

      {/* Place bet button */}
      <button
        onClick={onPlaceBet}
        disabled={!canBet || isActive}
        className={isActive ? 'animate-pulse-glow' : ''}
        style={getButtonStyle()}
        onMouseOver={(e) => {
          if (canBet && !isActive) {
            e.currentTarget.style.background = 'var(--action-hover)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseOut={(e) => {
          if (canBet && !isActive) {
            e.currentTarget.style.background = 'var(--action)'
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
        {STATE_LABELS[state]}
      </button>
    </div>
  )
}
