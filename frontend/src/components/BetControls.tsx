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
      return { ...base, background: 'linear-gradient(180deg, var(--win) 0%, var(--win-dim) 100%)', color: 'oklch(15% 0.02 155)', boxShadow: '0 0 20px oklch(72% 0.18 155 / 0.3)' }
    }
    if (state === 'lost') {
      return { ...base, background: 'linear-gradient(180deg, var(--lose) 0%, var(--lose-dim) 100%)', color: 'oklch(95% 0.01 25)', boxShadow: '0 0 20px oklch(62% 0.2 25 / 0.3)' }
    }
    if (isActive) {
      return { ...base, background: 'linear-gradient(180deg, var(--accent-gold-bright) 0%, var(--accent-gold) 100%)', color: 'oklch(15% 0.02 85)', cursor: 'wait' }
    }
    if (canBet) {
      return { ...base, background: 'linear-gradient(180deg, var(--action-hover) 0%, var(--action) 100%)', color: 'var(--text-primary)', boxShadow: '0 4px 16px oklch(58% 0.18 265 / 0.3)' }
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
        background: 'linear-gradient(180deg, var(--surface-2) 0%, var(--surface-1) 100%)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--surface-4)',
        boxShadow: 'var(--shadow-card), inset 0 1px 0 oklch(100% 0 0 / 0.04)',
      }}
    >
      {/* Bet amount — casino chip style */}
      <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-gold-dim)', minWidth: '28px', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-heading)' }}>
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
                fontWeight: 700,
                borderRadius: '50px',
                border: betAmount === opt.value ? '2px solid var(--accent-gold)' : '2px solid var(--surface-4)',
                background: betAmount === opt.value
                  ? 'linear-gradient(180deg, var(--surface-4) 0%, var(--surface-3) 100%)'
                  : 'var(--surface-2)',
                color: betAmount === opt.value ? 'var(--accent-gold)' : 'var(--text-secondary)',
                cursor: isActive ? 'not-allowed' : 'pointer',
                opacity: isActive ? 0.5 : 1,
                transition: 'all 0.2s ease-out',
                fontVariantNumeric: 'tabular-nums',
                boxShadow: betAmount === opt.value ? 'var(--shadow-gold)' : 'none',
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
        <div className="animate-win-burst" style={{
          textAlign: 'center',
          color: 'var(--win)',
          fontWeight: 800,
          fontSize: '1.35rem',
          fontFamily: 'var(--font-heading)',
          textShadow: '0 0 30px oklch(72% 0.18 155 / 0.6)',
          letterSpacing: '0.06em',
        }}>
          You won!
        </div>
      )}
      {state === 'lost' && (
        <div className="animate-lose-shake" style={{
          textAlign: 'center',
          color: 'var(--lose)',
          fontWeight: 700,
          fontSize: '1.125rem',
          fontFamily: 'var(--font-heading)',
          opacity: 0.85,
        }}>
          Better luck next time
        </div>
      )}

      {/* Place bet button */}
      <button
        onClick={onPlaceBet}
        disabled={!canBet || isActive}
        className={
          state === 'won' ? 'animate-win-ring' :
          state === 'lost' ? '' :
          isActive ? 'animate-pulse-glow' : ''
        }
        style={getButtonStyle()}
        onMouseOver={(e) => {
          if (canBet && !isActive) {
            e.currentTarget.style.background = 'linear-gradient(180deg, oklch(68% 0.22 265) 0%, var(--action-hover) 100%)'
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 24px oklch(58% 0.18 265 / 0.4)'
          }
        }}
        onMouseOut={(e) => {
          if (canBet && !isActive) {
            e.currentTarget.style.background = 'linear-gradient(180deg, var(--action-hover) 0%, var(--action) 100%)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 16px oklch(58% 0.18 265 / 0.3)'
          }
        }}
      >
        {STATE_LABELS[state]}
      </button>
    </div>
  )
}
