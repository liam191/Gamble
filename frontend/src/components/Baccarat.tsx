'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { CARD_BACK, baccaratCards, type Card, type BaccaratResult } from '@/lib/cards'

const PLAYER_MASK = 0b0000001111110
const BANKER_MASK = 0b1111110000000
const TIE_MASK    = 0b0000000000001

function diceToOutcome(dice: number): 'player' | 'banker' | 'tie' {
  if (dice === 0) return 'tie'
  if (dice <= 6) return 'player'
  return 'banker'
}

interface Props {
  selected: number
  onSelect: (mask: number) => void
  result: number | null
  commitHash: string | null
  isLocked: boolean
  isRolling: boolean
}

function BaccaratHand({ cards, revealed, label, total, isWinner }: {
  cards: Card[]
  revealed: boolean[]
  label: string
  total: number | null
  isWinner: boolean
}) {
  return (
    <div
      className="flex flex-col items-center"
      style={{
        gap: 'var(--space-2)',
        transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        transform: isWinner ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
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
        {total !== null && (
          <span style={{
            fontSize: '1rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            background: isWinner ? 'var(--accent-gold)' : 'var(--surface-3)',
            color: isWinner ? 'oklch(15% 0.02 85)' : 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {total}
          </span>
        )}
      </div>
      <div className="flex" style={{ gap: 'var(--space-1)' }}>
        {cards.map((card, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              width: '64px',
              height: '96px',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              transition: 'box-shadow 0.5s ease-out',
              boxShadow: isWinner ? '0 0 12px var(--accent-gold)' : 'var(--shadow-card)',
              perspective: '600px',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                transition: 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                transformStyle: 'preserve-3d',
                transform: revealed[i] ? 'rotateY(0deg)' : 'rotateY(180deg)',
              }}
            >
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                {revealed[i] && (
                  <Image src={card.image} alt={card.name} fill className="object-contain bg-white rounded" />
                )}
              </div>
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <Image src={CARD_BACK} alt="Back" fill className="object-contain rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Baccarat({ selected, onSelect, result, commitHash, isLocked, isRolling }: Props) {
  const [playerCards, setPlayerCards] = useState<Card[]>([])
  const [bankerCards, setBankerCards] = useState<Card[]>([])
  const [playerRevealed, setPlayerRevealed] = useState<boolean[]>([])
  const [bankerRevealed, setBankerRevealed] = useState<boolean[]>([])
  const [playerTotal, setPlayerTotal] = useState<number | null>(null)
  const [bankerTotal, setBankerTotal] = useState<number | null>(null)
  const [isNatural, setIsNatural] = useState(false)
  const [showResult, setShowResult] = useState(false)

  const outcome = result !== null ? diceToOutcome(result) : null

  useEffect(() => {
    if (result !== null && commitHash) {
      const outcomeIdx = outcome === 'player' ? 0 : outcome === 'banker' ? 1 : 2
      const data = baccaratCards(commitHash, outcomeIdx)
      setPlayerCards(data.player)
      setBankerCards(data.banker)
      setIsNatural(data.isNatural)
      setPlayerRevealed(new Array(data.player.length).fill(false))
      setBankerRevealed(new Array(data.banker.length).fill(false))
      setPlayerTotal(null)
      setBankerTotal(null)
      setShowResult(false)

      const timers: ReturnType<typeof setTimeout>[] = []
      const delay = 500

      timers.push(setTimeout(() => setPlayerRevealed(prev => { const n = [...prev]; n[0] = true; return n }), delay))
      timers.push(setTimeout(() => setBankerRevealed(prev => { const n = [...prev]; n[0] = true; return n }), delay + 500))
      timers.push(setTimeout(() => setPlayerRevealed(prev => { const n = [...prev]; n[1] = true; return n }), delay + 1000))
      timers.push(setTimeout(() => setBankerRevealed(prev => { const n = [...prev]; n[1] = true; return n }), delay + 1500))

      let nextTime = delay + 2000

      timers.push(setTimeout(() => {
        setPlayerTotal(data.playerInitialTotal)
        setBankerTotal(data.bankerInitialTotal)
      }, nextTime))
      nextTime += 400

      if (data.player.length > 2) {
        timers.push(setTimeout(() => {
          setPlayerRevealed(prev => { const n = [...prev]; n[2] = true; return n })
          setPlayerTotal(data.playerTotal)
        }, nextTime + 500))
        nextTime += 1000
      }
      if (data.banker.length > 2) {
        timers.push(setTimeout(() => {
          setBankerRevealed(prev => { const n = [...prev]; n[2] = true; return n })
          setBankerTotal(data.bankerTotal)
        }, nextTime + 500))
        nextTime += 1000
      }

      timers.push(setTimeout(() => setShowResult(true), nextTime + 500))

      return () => timers.forEach(clearTimeout)
    } else {
      setPlayerCards([])
      setBankerCards([])
      setPlayerRevealed([])
      setBankerRevealed([])
      setPlayerTotal(null)
      setBankerTotal(null)
      setIsNatural(false)
      setShowResult(false)
    }
  }, [result, commitHash, outcome])

  const naturalTag = isNatural ? ' (Natural!)' : ''
  const resultText = outcome === 'player' ? `Player Wins!${naturalTag}`
    : outcome === 'banker' ? `Banker Wins!${naturalTag}`
    : outcome === 'tie' ? `Tie!${naturalTag}`
    : null

  const betOptions = [
    { mask: PLAYER_MASK, label: '🎰 Player', sub: '2.08x', activeBg: 'var(--action)' },
    { mask: TIE_MASK, label: '🤝 Tie', sub: '12.48x', activeBg: 'var(--win)' },
    { mask: BANKER_MASK, label: '🏦 Banker', sub: '2.08x', activeBg: 'oklch(50% 0.18 25)' },
  ]

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-5)', padding: 'var(--space-4) 0' }}>
      {/* Table */}
      <div
        style={{
          width: '100%',
          background: 'var(--felt-green-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          border: '1px solid oklch(30% 0.04 155)',
        }}
      >
        <div className="flex justify-around items-start">
          <BaccaratHand
            cards={playerCards} revealed={playerRevealed}
            label="🎰 Player" total={playerTotal} isWinner={outcome === 'player' || outcome === 'tie'}
          />
          <BaccaratHand
            cards={bankerCards} revealed={bankerRevealed}
            label="🏦 Banker" total={bankerTotal} isWinner={outcome === 'banker' || outcome === 'tie'}
          />
        </div>
      </div>

      {showResult && resultText && (
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
