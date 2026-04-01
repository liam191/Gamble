'use client'

import { useState, useEffect, useRef } from 'react'
import {
  WHEEL_ORDER, numberColor, hasBit, toggleBit, countBits, PRESETS,
} from '@/lib/roulette'

interface Props {
  mask: number
  onMaskChange: (mask: number) => void
  result: number | null
  isLocked: boolean
  isRolling: boolean
}

// ── Wheel component ──

function RouletteWheel({ result, isRolling }: { result: number | null; isRolling: boolean }) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (isRolling) {
      setRotation(prev => prev + 3600)
    } else if (result !== null) {
      const idx = WHEEL_ORDER.indexOf(result)
      const segDeg = 360 / 37
      const targetDeg = 360 * 5 + (360 - idx * segDeg)
      setRotation(prev => prev + targetDeg)
    }
  }, [result, isRolling])

  return (
    <div className="relative" style={{ width: '208px', height: '208px', margin: '0 auto' }}>
      {/* Wheel */}
      <div
        ref={wheelRef}
        className="w-full h-full rounded-full overflow-hidden"
        style={{
          border: '4px solid var(--accent-gold)',
          boxShadow: '0 0 24px oklch(78% 0.16 85 / 0.25), inset 0 0 24px oklch(0% 0 0 / 0.4), 0 0 0 2px var(--accent-gold-dim)',
          transform: `rotate(${rotation}deg)`,
          transition: isRolling
            ? 'transform 2s linear'
            : 'transform 4s cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      >
        {/* Conic segments */}
        <div className="w-full h-full rounded-full relative"
          style={{
            background: `conic-gradient(${WHEEL_ORDER.map((n, i) => {
              const color = numberColor(n)
              const c = color === 'red' ? 'oklch(48% 0.2 25)' : color === 'black' ? 'oklch(15% 0.02 270)' : 'oklch(42% 0.12 155)'
              const start = (i / 37) * 100
              const end = ((i + 1) / 37) * 100
              return `${c} ${start}% ${end}%`
            }).join(', ')})`,
          }}
        >
          {WHEEL_ORDER.map((n, i) => {
            const angle = (i / 37) * 360 + (360 / 37 / 2)
            return (
              <div
                key={n}
                className="absolute"
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  left: '50%',
                  top: '50%',
                  transform: `rotate(${angle}deg) translateY(-42%) rotate(-${angle}deg)`,
                  transformOrigin: '0 0',
                  marginLeft: '-5px',
                  marginTop: '-5px',
                }}
              >
                {n}
              </div>
            )
          })}
        </div>
      </div>

      {/* Pointer */}
      <div className="absolute" style={{
        top: 0,
        left: '50%',
        transform: 'translateX(-50%) translateY(-1px)',
        zIndex: 10,
      }}>
        <div style={{
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '16px solid var(--accent-gold)',
          filter: 'drop-shadow(0 2px 4px oklch(78% 0.16 85 / 0.3))',
        }} />
      </div>

      {/* Center display */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={result !== null && !isRolling ? 'animate-ball-bounce' : ''}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: 800,
            fontFamily: 'var(--font-heading)',
            fontVariantNumeric: 'tabular-nums',
            boxShadow: result !== null && !isRolling
              ? `inset 0 2px 8px oklch(0% 0 0 / 0.3), 0 0 16px ${numberColor(result) === 'red' ? 'oklch(48% 0.2 25 / 0.5)' : numberColor(result) === 'green' ? 'oklch(42% 0.12 155 / 0.5)' : 'oklch(50% 0.02 270 / 0.5)'}`
              : 'inset 0 2px 8px oklch(0% 0 0 / 0.3)',
            background: result !== null && !isRolling
              ? (numberColor(result) === 'red' ? 'oklch(48% 0.2 25)'
                : numberColor(result) === 'black' ? 'oklch(15% 0.02 270)'
                : 'oklch(42% 0.12 155)')
              : isRolling ? 'var(--accent-gold-dim)' : 'var(--surface-3)',
            color: result !== null && !isRolling ? 'var(--text-primary)' : isRolling ? 'oklch(15% 0.02 85)' : 'var(--text-muted)',
            transition: 'background 0.3s ease-out',
            border: result !== null && !isRolling ? '2px solid oklch(100% 0 0 / 0.15)' : '2px solid transparent',
          }}
        >
          {isRolling ? (
            <span className="animate-number-scan" style={{ fontSize: '1.25rem' }}>?</span>
          ) : result !== null ? result : '-'}
        </div>
      </div>
    </div>
  )
}

// ── Betting Table ──

function BettingTable({ mask, onMaskChange, isLocked }: {
  mask: number
  onMaskChange: (mask: number) => void
  isLocked: boolean
}) {
  const toggleNum = (n: number) => {
    if (isLocked) return
    onMaskChange(toggleBit(mask, n))
  }

  const setPreset = (presetMask: number) => {
    if (isLocked) return
    if (mask === presetMask) onMaskChange(0)
    else onMaskChange(presetMask)
  }

  const numBtn = (n: number) => {
    const color = numberColor(n)
    const selected = hasBit(mask, n)
    const bgColor = color === 'red'
      ? (selected ? 'oklch(55% 0.22 25)' : 'oklch(40% 0.15 25)')
      : color === 'black'
      ? (selected ? 'oklch(35% 0.02 270)' : 'oklch(20% 0.02 270)')
      : (selected ? 'oklch(50% 0.14 155)' : 'oklch(35% 0.1 155)')

    return (
      <button
        key={n}
        onClick={() => toggleNum(n)}
        disabled={isLocked}
        style={{
          width: '36px',
          height: '36px',
          fontSize: '0.6875rem',
          fontWeight: 700,
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bgColor,
          color: 'var(--text-primary)',
          border: selected ? '2px solid var(--accent-gold)' : '1px solid oklch(30% 0.02 270)',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isLocked ? 0.5 : 1,
          transition: 'all 0.15s ease-out',
          transform: selected ? 'scale(1.08)' : 'scale(1)',
          boxShadow: selected ? 'var(--shadow-gold)' : 'none',
        }}
      >
        {n}
      </button>
    )
  }

  const presetBtn = (label: string, presetMask: number, extra?: string) => (
    <button
      onClick={() => setPreset(presetMask)}
      disabled={isLocked}
      className={extra || ''}
      style={{
        padding: 'var(--space-1) var(--space-2)',
        fontSize: '0.6875rem',
        fontWeight: 700,
        borderRadius: 'var(--radius-sm)',
        background: mask === presetMask ? 'var(--surface-4)' : 'var(--surface-3)',
        color: mask === presetMask ? 'var(--accent-gold)' : 'var(--text-secondary)',
        border: mask === presetMask ? '1px solid var(--accent-gold-dim)' : '1px solid var(--surface-4)',
        cursor: isLocked ? 'not-allowed' : 'pointer',
        opacity: isLocked ? 0.5 : 1,
        transition: 'all 0.15s ease-out',
      }}
    >
      {label}
    </button>
  )

  const row3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]
  const row2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]
  const row1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: '420px', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        {/* Zero */}
        <div className="flex" style={{ gap: 'var(--space-1)' }}>
          {numBtn(0)}
        </div>

        {/* Number grid */}
        <div className="flex" style={{ gap: 'var(--space-1)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <div className="flex" style={{ gap: 'var(--space-1)' }}>{row3.map(n => numBtn(n))}</div>
            <div className="flex" style={{ gap: 'var(--space-1)' }}>{row2.map(n => numBtn(n))}</div>
            <div className="flex" style={{ gap: 'var(--space-1)' }}>{row1.map(n => numBtn(n))}</div>
          </div>
          {/* Column bets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {presetBtn('2:1', PRESETS.col3)}
            {presetBtn('2:1', PRESETS.col2)}
            {presetBtn('2:1', PRESETS.col1)}
          </div>
        </div>

        {/* Dozens */}
        <div className="flex" style={{ gap: 'var(--space-1)' }}>
          {presetBtn('1st 12', PRESETS.dozen1, 'flex-1')}
          {presetBtn('2nd 12', PRESETS.dozen2, 'flex-1')}
          {presetBtn('3rd 12', PRESETS.dozen3, 'flex-1')}
        </div>

        {/* Outside bets */}
        <div className="flex" style={{ gap: 'var(--space-1)' }}>
          {presetBtn('1-18', PRESETS.low, 'flex-1')}
          {presetBtn('Even', PRESETS.even, 'flex-1')}
          <button
            onClick={() => setPreset(PRESETS.red)}
            disabled={isLocked}
            className="flex-1"
            style={{
              padding: 'var(--space-1) var(--space-2)',
              fontSize: '0.6875rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              background: mask === PRESETS.red ? 'oklch(55% 0.22 25)' : 'oklch(40% 0.15 25)',
              color: 'var(--text-primary)',
              border: mask === PRESETS.red ? '1px solid var(--accent-gold-dim)' : '1px solid oklch(30% 0.02 270)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.15s ease-out',
            }}
          >
            Red
          </button>
          <button
            onClick={() => setPreset(PRESETS.black)}
            disabled={isLocked}
            className="flex-1"
            style={{
              padding: 'var(--space-1) var(--space-2)',
              fontSize: '0.6875rem',
              fontWeight: 700,
              borderRadius: 'var(--radius-sm)',
              background: mask === PRESETS.black ? 'oklch(30% 0.02 270)' : 'oklch(18% 0.02 270)',
              color: 'var(--text-primary)',
              border: mask === PRESETS.black ? '1px solid var(--accent-gold-dim)' : '1px solid oklch(30% 0.02 270)',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.15s ease-out',
            }}
          >
            Black
          </button>
          {presetBtn('Odd', PRESETS.odd, 'flex-1')}
          {presetBtn('19-36', PRESETS.high, 'flex-1')}
        </div>
      </div>
    </div>
  )
}

// ── Main component ──

export function RouletteGame({ mask, onMaskChange, result, isLocked, isRolling }: Props) {
  const selected = countBits(mask)

  return (
    <div className="flex flex-col items-center" style={{ gap: 'var(--space-4)', padding: 'var(--space-2) 0' }}>
      <RouletteWheel result={result} isRolling={isRolling} />

      {result !== null && !isRolling && (
        <div className={hasBit(mask, result) ? 'animate-win-burst' : 'animate-result'} style={{
          fontSize: '1.125rem',
          fontWeight: 800,
          fontFamily: 'var(--font-heading)',
          color: numberColor(result) === 'red' ? 'var(--lose)' :
            numberColor(result) === 'green' ? 'var(--win)' : 'var(--text-secondary)',
          textShadow: hasBit(mask, result) ? '0 0 20px oklch(72% 0.18 155 / 0.5)' : 'none',
        }}>
          {result} {numberColor(result) === 'red' ? 'Red' : numberColor(result) === 'black' ? 'Black' : 'Green'}
          {hasBit(mask, result) ? ' — You Win!' : ' — You Lose'}
        </div>
      )}

      <BettingTable mask={mask} onMaskChange={onMaskChange} isLocked={isLocked} />

      {selected > 0 && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {selected} number{selected > 1 ? 's' : ''} selected ({((selected / 37) * 100).toFixed(1)}% chance)
        </div>
      )}
    </div>
  )
}
