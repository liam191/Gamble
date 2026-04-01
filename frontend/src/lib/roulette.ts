// European Roulette: 37 numbers (0-36)

// Wheel order (European)
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
export const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35])

export function numberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  if (RED_NUMBERS.has(n)) return 'red'
  return 'black'
}

// ── Bit operations for 37-bit mask (can't use bitwise ops > 31 bits in JS) ──

export function hasBit(mask: number, bit: number): boolean {
  return Math.floor(mask / (2 ** bit)) % 2 === 1
}

export function toggleBit(mask: number, bit: number): number {
  if (hasBit(mask, bit)) return mask - 2 ** bit
  return mask + 2 ** bit
}

export function countBits(mask: number, maxBits: number = 37): number {
  let count = 0
  for (let i = 0; i < maxBits; i++) {
    if (hasBit(mask, i)) count++
  }
  return count
}

// ── Preset bet masks ──

function maskFromNumbers(nums: number[]): number {
  let m = 0
  for (const n of nums) m += 2 ** n
  return m
}

export const PRESETS = {
  red: maskFromNumbers([...RED_NUMBERS]),
  black: maskFromNumbers([...BLACK_NUMBERS]),
  odd: maskFromNumbers([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35]),
  even: maskFromNumbers([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]),
  low: maskFromNumbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
  high: maskFromNumbers([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]),
  dozen1: maskFromNumbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  dozen2: maskFromNumbers([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  dozen3: maskFromNumbers([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]),
  col1: maskFromNumbers([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]),
  col2: maskFromNumbers([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]),
  col3: maskFromNumbers([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]),
}
