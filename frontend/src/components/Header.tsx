'use client'

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatEther } from 'viem'
import { upchain } from '@/lib/constants'
import { truncAddr } from '@/lib/utils'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address, chainId: upchain.id })
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <header
      className="flex items-center justify-between"
      style={{
        padding: 'var(--space-4) var(--space-6)',
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--surface-3)',
      }}
    >
      <h1
        className="font-heading"
        style={{
          fontSize: 'clamp(1.1rem, 2.5vw, 1.35rem)',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--accent-gold)',
        }}
      >
        UPchain Casino
      </h1>
      <div className="flex items-center" style={{ gap: 'var(--space-3)' }}>
        {mounted && isConnected && balance && (
          <span
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {parseFloat(formatEther(balance.value)).toFixed(4)} ETH
          </span>
        )}
        {mounted && isConnected ? (
          <button
            onClick={() => disconnect()}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontSize: '0.8125rem',
              fontWeight: 600,
              background: 'var(--surface-3)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--surface-4)',
              cursor: 'pointer',
              transition: 'background 0.2s ease-out, border-color 0.2s ease-out',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--surface-4)'
              e.currentTarget.style.borderColor = 'var(--accent-gold-dim)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--surface-3)'
              e.currentTarget.style.borderColor = 'var(--surface-4)'
            }}
          >
            {truncAddr(address!)}
          </button>
        ) : (
          <button
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            disabled={!connectors[0]}
            style={{
              padding: 'var(--space-2) var(--space-5)',
              fontSize: '0.8125rem',
              fontWeight: 700,
              background: 'var(--accent-gold)',
              color: 'oklch(15% 0.02 85)',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: connectors[0] ? 'pointer' : 'not-allowed',
              opacity: connectors[0] ? 1 : 0.5,
              transition: 'background 0.2s ease-out, transform 0.15s ease-out',
            }}
            onMouseOver={(e) => {
              if (connectors[0]) {
                e.currentTarget.style.background = 'var(--accent-gold-bright)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--accent-gold)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {connectors[0] ? 'Connect Wallet' : 'No Wallet'}
          </button>
        )}
      </div>
    </header>
  )
}
