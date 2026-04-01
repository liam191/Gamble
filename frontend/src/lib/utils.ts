import { formatEther } from 'viem'

// betMask → 선택된 숫자의 popcount (rollUnder)
export function popcount(mask: number): number {
  let count = 0
  let m = mask
  while (m) {
    count += m & 1
    m >>= 1
  }
  return count
}

// dice betMask: 숫자 선택 (0-indexed) 토글
export function toggleDiceBit(mask: number, face: number): number {
  return mask ^ (1 << face)
}

// dice betMask → 선택된 숫자들 (1-indexed, display)
export function selectedFaces(mask: number): number[] {
  const faces: number[] = []
  for (let i = 0; i < 6; i++) {
    if (mask & (1 << i)) faces.push(i + 1)
  }
  return faces
}

// format UP amount (18 decimals) to readable
export function formatUP(weiStr: string): string {
  try {
    const val = BigInt(weiStr)
    const formatted = formatEther(val)
    return parseFloat(formatted).toFixed(2)
  } catch {
    return '0.00'
  }
}

// format address truncated
export function truncAddr(addr: string): string {
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

// game name from modulo
export function gameName(modulo: string): string {
  switch (modulo) {
    case '2': return 'Coin Flip'
    case '6': return 'Dice'
    case '13': return 'Card Game'
    case '36': return 'Double Dice'
    case '37': return 'Roulette'
    case '100': return 'Hi-Lo'
    default: return `Mod ${modulo}`
  }
}

// result display from diceResult + modulo
export function resultDisplay(diceResult: number, modulo: string): string {
  if (modulo === '2') {
    return diceResult === 0 ? 'Heads' : 'Tails'
  }
  if (modulo === '6') {
    return `${diceResult + 1}`
  }
  return `${diceResult}`
}

// ── Detailed versions for history table ──

export function gameNameDetailed(modulo: string, betMask: string, gameType?: string): string {
  // Prefer gameType if available (reliable)
  if (gameType) {
    switch (gameType) {
      case 'coin': return '🪙 Coin Flip'
      case 'dice': return '🎲 Dice'
      case 'doubledice': return '🎲🎲 Double Dice'
      case 'dragon': return '🐉 Dragon Tiger'
      case 'baccarat': return '🃏 Baccarat'
      case 'roulette': return '🎰 Roulette'
      case 'hilo': return '🎯 Hi-Lo'
    }
  }
  // Fallback to modulo (old history without gameType)
  switch (modulo) {
    case '2': return '🪙 Coin Flip'
    case '6': return '🎲 Dice'
    case '13': return '🃏 Card Game'
    case '36': return '🎲🎲 Double Dice'
    case '37': return '🎰 Roulette'
    case '100': return '🎯 Hi-Lo'
    default: return `Mod ${modulo}`
  }
}

function cardGameOutcome(diceResult: number): string {
  if (diceResult === 0) return 'Tie'
  if (diceResult <= 6) return 'Side A'
  return 'Side B'
}

export function resultDisplayDetailed(diceResult: number, modulo: string, gameType?: string): string {
  if (modulo === '2') {
    return diceResult === 0 ? 'Heads' : 'Tails'
  }
  if (modulo === '6') {
    return `🎲 ${diceResult + 1}`
  }
  if (modulo === '13') {
    if (diceResult === 0) return '🤝 Tie'
    if (gameType === 'dragon') {
      return diceResult <= 6 ? '🐉 Dragon' : '🐯 Tiger'
    }
    if (gameType === 'baccarat') {
      return diceResult <= 6 ? '🎰 Player' : '🏦 Banker'
    }
    // Fallback (no gameType)
    return diceResult <= 6 ? 'Side 1' : 'Side 2'
  }
  if (modulo === '36') {
    const d1 = Math.floor(diceResult / 6) + 1
    const d2 = (diceResult % 6) + 1
    return `${d1}+${d2}=${d1 + d2}`
  }
  if (modulo === '37') {
    return `#${diceResult}`
  }
  if (modulo === '100') {
    return `${diceResult}`
  }
  return `${diceResult}`
}
