import { API_URL } from './constants'

// ── Types ──

export interface CommitResponse {
  commit: string
  commitLastBlock: number
  v: number
  r: string
  s: string
}

export interface HistoryEntry {
  commit: string
  player: string
  token: string
  amount: string
  modulo: string
  betMask: string
  gameType: string
  eventType: 'settled' | 'refunded'
  diceResult: number
  won: boolean
  payoutUP: string
  block: number
  txHash: string
}

// ── API calls ──

export async function fetchCommit(params: {
  player: string
  token: string
  amount: string
  betMask: string
  modulo: string
  gameType: string
}): Promise<CommitResponse> {
  const resp = await fetch(`${API_URL}/api/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `HTTP ${resp.status}`)
  }

  return resp.json()
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const resp = await fetch(`${API_URL}/api/history`)
  if (!resp.ok) throw new Error(`History API error: ${resp.status}`)
  const data = await resp.json()
  return data.bets || []
}
