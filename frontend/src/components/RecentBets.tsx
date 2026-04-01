'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { fetchHistory, type HistoryEntry } from '@/lib/api'
import { formatUP, gameNameDetailed, resultDisplayDetailed } from '@/lib/utils'
import { formatEther } from 'viem'

export function RecentBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<HistoryEntry[]>([])
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    setBets([])

    if (!address) {
      return
    }

    const load = async () => {
      try {
        const all = await fetchHistory()
        all.sort((a, b) => b.block - a.block)
        const mine = all.filter(
          (b) => b.player.toLowerCase() === address.toLowerCase()
        )
        setBets(mine.slice(0, 10))
      } catch {
        // API down — keep current state, retry next interval
      }
    }

    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [address])

  if (!mounted || !address) {
    return (
      <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
        Connect wallet to see your bets
      </div>
    )
  }

  if (bets.length === 0) {
    return (
      <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
        No bets yet — place your first bet above
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--surface-4)' }}>
            {['Game', 'Result', 'Bet', 'Payout', ''].map((h) => (
              <th
                key={h}
                style={{
                  padding: 'var(--space-3) var(--space-3)',
                  textAlign: h === 'Bet' || h === 'Payout' ? 'right' : 'left',
                  color: 'var(--accent-gold-dim)',
                  fontWeight: 700,
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontFamily: 'var(--font-heading)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bets.map((bet, i) => (
            <tr
              key={bet.commit}
              className="animate-fade-in"
              style={{
                borderBottom: i < bets.length - 1 ? '1px solid var(--surface-2)' : 'none',
                animationDelay: `${i * 30}ms`,
              }}
            >
              <td style={{ padding: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                {gameNameDetailed(bet.modulo, bet.betMask, bet.gameType)}
              </td>
              <td style={{ padding: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                {bet.eventType === 'refunded'
                  ? '-'
                  : resultDisplayDetailed(bet.diceResult, bet.modulo, bet.gameType)}
              </td>
              <td style={{ padding: 'var(--space-3)', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {parseFloat(formatEther(BigInt(bet.amount || '0'))).toFixed(3)} ETH
              </td>
              <td style={{ padding: 'var(--space-3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {bet.eventType === 'refunded' ? (
                  <span style={{ color: 'var(--accent-gold-dim)' }}>Refunded</span>
                ) : bet.won ? (
                  <span style={{ color: 'var(--win)', fontWeight: 600 }}>{formatUP(bet.payoutUP)} UP</span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>0</span>
                )}
              </td>
              <td style={{ padding: 'var(--space-3)' }}>
                {bet.eventType === 'refunded' ? (
                  <span style={{ color: 'var(--accent-gold-dim)', fontSize: '0.75rem' }}>Refund</span>
                ) : bet.won ? (
                  <span style={{ color: 'var(--win)', fontSize: '0.75rem', fontWeight: 600 }}>Won</span>
                ) : (
                  <span style={{ color: 'var(--lose-dim)', fontSize: '0.75rem' }}>Lost</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
