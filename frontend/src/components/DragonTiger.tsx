'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { CARD_BACK, dragonTigerCards, type Card } from '@/lib/cards'

const DRAGON_MASK = 0b0000001111110
const TIGER_MASK  = 0b1111110000000
const TIE_MASK    = 0b0000000000001

function diceToOutcome(dice: number): 'dragon' | 'tiger' | 'tie' {
  if (dice === 0) return 'tie'
  if (dice <= 6) return 'dragon'
  return 'tiger'
}

interface Props {
  selected: number
  onSelect: (mask: number) => void
  result: number | null
  commitHash: string | null
  isLocked: boolean
  isRolling: boolean
}

function CardDisplay({ card, revealed, label, isWinner, isRolling }: {
  card: Card | null
  revealed: boolean
  label: string
  isWinner: boolean
  isRolling: boolean
}) {
  return (
    <div
      className="flex flex-col items-center"
      style={{
        gap: 'var(--space-2)',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isWinner ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      <span style={{
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontFamily: 'var(--font-heading)',
      }}>
        {label}
      </span>
      <div
        style={{
          position: 'relative',
          width: '96px',
          height: '144px',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          transition: 'box-shadow 0.5s ease-out',
          boxShadow: isWinner ? '0 0 20px var(--accent-gold), 0 0 2px var(--accent-gold)' : 'var(--shadow-card)',
          perspective: '600px',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transition: 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
            transformStyle: 'preserve-3d',
            transform: revealed ? 'rotateY(0deg)' : 'rotateY(180deg)',
          }}
        >
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            {card && revealed && (
              <Image src={card.image} alt={card.name} fill className="object-contain bg-white rounded-lg" />
            )}
          </div>
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <Image src={CARD_BACK} alt="Card back" fill className={`object-contain rounded-lg ${isRolling && !revealed ? 'animate-shimmer' : ''}`} />
          </div>
        </div>
      </div>
      {card && revealed && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{card.name}</span>
      )}
    </div>
  )
}

export function DragonTiger({ selected, onSelect, result, commitHash, isLocked, isRolling }: Props) {
  const [dragonCard, setDragonCard] = useState<Card | null>(null)
  const [tigerCard, setTigerCard] = useState<Card | null>(null)
  const [dragonRevealed, setDragonRevealed] = useState(false)
  const [tigerRevealed, setTigerRevealed] = useState(false)

  const outcome = result !== null ? diceToOutcome(result) : null

  useEffect(() => {
    if (result !== null && commitHash) {
      const outcomeIdx = outcome === 'dragon' ? 0 : outcome === 'tiger' ? 1 : 2
      const [dragon, tiger] = dragonTigerCards(commitHash, outcomeIdx)
      setDragonCard(dragon)
      setTigerCard(tiger)
      setDragonRevealed(false)
      setTigerRevealed(false)

      const t1 = setTimeout(() => setDragonRevealed(true), 500)
      const t2 = setTimeout(() => setTigerRevealed(true), 1200)
      return () => { clearTimeout(t1); clearTimeout(t2) }
    } else {
      setDragonCard(null)
      setTigerCard(null)
      setDragonRevealed(false)
      setTigerRevealed(false)
    }
  }, [result, commitHash, outcome])

  const resultText = outcome === 'dragon' ? 'Dragon Wins!'
    : outcome === 'tiger' ? 'Tiger Wins!'
    : outcome === 'tie' ? 'Tie!'
    : null

  const betOptions = [
    { mask: DRAGON_MASK, label: '🐉 Dragon', sub: '2.08x', activeBg: 'oklch(50% 0.18 25)' },
    { mask: TIE_MASK, label: '🤝 Tie', sub: '12.48x', activeBg: 'var(--win)' },
    { mask: TIGER_MASK, label: '🐯 Tiger', sub: '2.08x', activeBg: 'var(--action)' },
  ]

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-6)', padding: 'var(--space-6) 0' }}>
      {/* Cards */}
      <div className="flex items-center" style={{ gap: 'var(--space-8)' }}>
        <CardDisplay card={dragonCard} revealed={dragonRevealed} label="🐉 Dragon" isWinner={outcome === 'dragon' || outcome === 'tie'} isRolling={isRolling} />
        <div style={{
          fontSize: '1.25rem',
          fontWeight: 800,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-heading)',
        }}>VS</div>
        <CardDisplay card={tigerCard} revealed={tigerRevealed} label="🐯 Tiger" isWinner={outcome === 'tiger' || outcome === 'tie'} isRolling={isRolling} />
      </div>

      {resultText && (
        <div className="animate-result" style={{
          fontSize: '1.125rem',
          fontWeight: 700,
          color: 'var(--accent-gold)',
          fontFamily: 'var(--font-heading)',
        }}>
          {resultText}
        </div>
      )}

      {/* Betting buttons */}
      <div className="flex" style={{ gap: 'var(--space-3)' }}>
        {betOptions.map(({ mask, label, sub, activeBg }) => (
          <button
            key={mask}
            onClick={() => onSelect(mask)}
            disabled={isLocked}
            style={{
              padding: 'var(--space-3) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-1)',
              background: selected === mask ? activeBg : 'var(--surface-3)',
              color: selected === mask ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: selected === mask ? 'none' : '1px solid var(--surface-4)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: selected === mask ? 'scale(1.05)' : 'scale(1)',
              boxShadow: selected === mask ? 'var(--shadow-elevated)' : 'none',
            }}
          >
            <span style={{ fontSize: '0.875rem' }}>{label}</span>
            <span style={{ fontSize: '0.6875rem', opacity: 0.7 }}>{sub}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
