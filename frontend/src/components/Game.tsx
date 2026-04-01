'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { parseEther, parseAbiItem } from 'viem'
import { CASINO_ADDRESS, ETH_SENTINEL, casinoAbi } from '@/lib/constants'
import { fetchCommit } from '@/lib/api'
import { popcount } from '@/lib/utils'
import { CoinFlip } from './CoinFlip'
import { Dice } from './Dice'
import { DragonTiger } from './DragonTiger'
import { Baccarat } from './Baccarat'
import { Roulette } from './Roulette'
import { RouletteGame } from './RouletteGame'
import { DoubleDice } from './DoubleDice'
import { BetControls, type BetState } from './BetControls'
import { countBits } from '@/lib/roulette'

type GameType = 'coin' | 'dice' | 'dragon' | 'baccarat' | 'roulette' | 'hilo' | 'doubledice'

const GAMES: { id: GameType; label: string; icon: string; modulo: number }[] = [
  { id: 'coin', label: 'Coin Flip', icon: '🪙', modulo: 2 },
  { id: 'dice', label: 'Dice', icon: '🎲', modulo: 6 },
  { id: 'doubledice', label: 'Double Dice', icon: '🎲🎲', modulo: 36 },
  { id: 'roulette', label: 'Roulette', icon: '🎰', modulo: 37 },
  { id: 'dragon', label: 'Dragon Tiger', icon: '🐉', modulo: 13 },
  { id: 'baccarat', label: 'Baccarat', icon: '🃏', modulo: 13 },
  { id: 'hilo', label: 'Hi-Lo', icon: '🎯', modulo: 100 },
]

export function Game() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  // Prevent hydration mismatch — render only on client
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [game, setGame] = useState<GameType>('coin')
  const [betMask, setBetMask] = useState(0)
  const [betAmount, setBetAmount] = useState('0.01')
  const [state, setState] = useState<BetState>('idle')
  const [result, setResult] = useState<number | null>(null)
  const [potentialWinETH, setPotentialWinETH] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [commitHash, setCommitHash] = useState<string | null>(null)

  const [rollUnder, setRollUnder] = useState(50)

  const currentGame = GAMES.find(g => g.id === game)!
  const modulo = currentGame.modulo

  const effectiveBetMask = game === 'hilo' ? rollUnder : betMask
  const effectiveRollUnder = game === 'hilo' ? rollUnder
    : game === 'roulette' ? countBits(betMask)
    : game === 'doubledice' ? countBits(betMask, 36)
    : popcount(betMask)

  const canBet = isConnected && effectiveBetMask > 0 && (state === 'idle' || state === 'won' || state === 'lost')

  const switchGame = (g: GameType) => {
    if (isLocked) return
    setGame(g)
    setBetMask(0)
    setRollUnder(50)
    setResult(null)
    setCommitHash(null)
    setState('idle')
    setError(null)
  }

  useEffect(() => {
    if (effectiveBetMask === 0 || effectiveRollUnder === 0) {
      setPotentialWinETH(null)
      return
    }
    const bet = parseFloat(betAmount)
    const win = bet * 0.96 * modulo / effectiveRollUnder
    setPotentialWinETH(win.toFixed(4))
  }, [effectiveBetMask, effectiveRollUnder, betAmount, modulo])

  const placeBet = useCallback(async () => {
    if (!address || !publicClient) return
    setError(null)
    setResult(null)
    setCommitHash(null)

    try {
      setState('fetching')
      const commit = await fetchCommit({
        player: address,
        token: ETH_SENTINEL,
        amount: parseEther(betAmount).toString(),
        betMask: effectiveBetMask.toString(),
        modulo: modulo.toString(),
        gameType: game,
      })
      setCommitHash(commit.commit)

      setState('wallet')
      const txHash = await writeContractAsync({
        address: CASINO_ADDRESS,
        abi: casinoAbi,
        functionName: 'placeBetETH',
        args: [
          BigInt(effectiveBetMask),
          BigInt(modulo),
          BigInt(commit.commitLastBlock),
          BigInt(commit.commit),
          commit.v,
          commit.r as `0x${string}`,
          commit.s as `0x${string}`,
        ],
        value: parseEther(betAmount),
      })

      setState('pending')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== 'success') throw new Error('Transaction reverted')

      setState('waiting')
      const settledEvent = parseAbiItem(
        'event BetSettled(uint256 indexed commit, address indexed player, uint256 diceResult, uint256 payoutUP)'
      )
      const startBlock = receipt.blockNumber

      for (let attempt = 0; attempt < 20; attempt++) {
        const logs = await publicClient.getLogs({
          address: CASINO_ADDRESS,
          event: settledEvent,
          args: { commit: BigInt(commit.commit) },
          fromBlock: startBlock,
          toBlock: 'latest',
        })
        if (logs.length > 0) {
          const diceResult = Number(logs[0].args.diceResult!)
          const payoutUP = logs[0].args.payoutUP!
          setResult(diceResult)
          setState(payoutUP > 0n ? 'won' : 'lost')
          return
        }
        await new Promise(r => setTimeout(r, 3000))
      }
      setError('Settlement pending. Check history.')
      setState('idle')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setState('idle')
        return
      }
      setError(msg.length > 100 ? msg.slice(0, 100) + '...' : msg)
      setState('idle')
    }
  }, [address, publicClient, writeContractAsync, betAmount, effectiveBetMask, modulo, game])

  const isRolling = state === 'waiting' || state === 'pending'
  const isLocked = state !== 'idle' && state !== 'won' && state !== 'lost'

  useEffect(() => {
    if (!isLocked) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isLocked])

  if (!mounted) return null

  return (
    <div className="max-w-lg mx-auto">
      {/* Game tabs */}
      <div
        className="flex overflow-x-auto"
        style={{
          gap: 'var(--space-1)',
          marginBottom: 0,
          paddingBottom: 'var(--space-1)',
        }}
      >
        {GAMES.map(g => (
          <button
            key={g.id}
            onClick={() => switchGame(g.id)}
            disabled={isLocked}
            style={{
              flexShrink: 0,
              padding: 'var(--space-2) var(--space-4)',
              fontSize: '0.8125rem',
              fontWeight: game === g.id ? 700 : 500,
              fontFamily: 'var(--font-heading)',
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              background: game === g.id ? 'var(--surface-2)' : 'transparent',
              color: game === g.id ? 'var(--text-primary)' : 'var(--text-muted)',
              border: game === g.id ? '1px solid var(--surface-3)' : '1px solid transparent',
              borderBottom: game === g.id ? '1px solid var(--surface-2)' : '1px solid transparent',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.5 : 1,
              transition: 'all 0.2s ease-out',
              whiteSpace: 'nowrap',
            }}
          >
            {g.icon} {g.label}
          </button>
        ))}
      </div>

      {/* Game area */}
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--surface-3)',
          borderTop: 'none',
          borderRadius: '0 var(--radius-lg) var(--radius-lg) var(--radius-lg)',
          padding: 'var(--space-5)',
          minHeight: '280px',
        }}
      >
        {game === 'coin' && (
          <CoinFlip selected={betMask} onSelect={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'dice' && (
          <Dice mask={betMask} onMaskChange={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'doubledice' && (
          <DoubleDice mask={betMask} onMaskChange={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'dragon' && (
          <DragonTiger selected={betMask} onSelect={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} commitHash={commitHash} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'baccarat' && (
          <Baccarat selected={betMask} onSelect={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} commitHash={commitHash} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'roulette' && (
          <RouletteGame mask={betMask} onMaskChange={(m) => { setBetMask(m); setResult(null); setState('idle') }} result={result} isLocked={isLocked} isRolling={isRolling} />
        )}
        {game === 'hilo' && (
          <Roulette rollUnder={rollUnder} onRollUnderChange={(v) => { setRollUnder(v); setResult(null); setState('idle') }} result={result} isLocked={isLocked} isRolling={isRolling} />
        )}
      </div>

      {/* Bet controls */}
      <div style={{ marginTop: 'var(--space-4)' }}>
        <BetControls
          betAmount={betAmount}
          onBetAmountChange={setBetAmount}
          potentialWinETH={potentialWinETH}
          state={state}
          canBet={canBet}
          onPlaceBet={placeBet}
        />
      </div>

      {error && (
        <div
          className="animate-fade-in"
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'oklch(25% 0.06 25)',
            border: '1px solid oklch(35% 0.1 25)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            color: 'var(--lose)',
          }}
        >
          {error}
        </div>
      )}
      {!isConnected && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-4)',
            background: 'var(--surface-1)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.875rem',
            border: '1px solid var(--surface-3)',
          }}
        >
          Connect your wallet to play
        </div>
      )}
    </div>
  )
}
