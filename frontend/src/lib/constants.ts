import { defineChain } from 'viem'

// ── Chain ──

export const upchain = defineChain({
  id: 31337,
  name: 'UPchain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_CHAIN_RPC || 'https://rpc.defi.chainlight.com'],
    },
  },
})

// ── Addresses ──

export const CASINO_ADDRESS = process.env.NEXT_PUBLIC_CASINO_ADDRESS as `0x${string}`
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
export const ETH_SENTINEL = '0x0000000000000000000000000000000000000000' as `0x${string}`

// ── Casino ABI (only functions we need) ──

export const casinoAbi = [
  {
    type: 'function',
    name: 'placeBetETH',
    inputs: [
      { name: 'betMask', type: 'uint256' },
      { name: 'modulo', type: 'uint256' },
      { name: 'commitLastBlock', type: 'uint256' },
      { name: 'commit', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'previewWinUP',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'modulo', type: 'uint256' },
      { name: 'rollUnder', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'BetSettled',
    inputs: [
      { name: 'commit', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'diceResult', type: 'uint256', indexed: false },
      { name: 'payoutUP', type: 'uint256', indexed: false },
    ],
  },
] as const

// ── Bet amounts ──

export const BET_OPTIONS = [
  { label: '0.01 ETH', value: '0.01' },
  { label: '0.02 ETH', value: '0.02' },
  { label: '0.05 ETH', value: '0.05' },
  { label: '0.1 ETH', value: '0.1' },
]

// ── Game types ──

export type GameType = 'coin' | 'dice'

export const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const
