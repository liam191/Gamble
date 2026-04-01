// Card utilities for Dragon Tiger & Baccarat

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'J', 'Q', 'K'] as const
const SUITS = ['S', 'H', 'D', 'C'] as const
const RANK_NAMES = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King']

export interface Card {
  rank: number    // 0-12 (Ace=0, King=12)
  suit: number    // 0-3 (Spades, Hearts, Diamonds, Clubs)
  image: string   // /cards/AS.png
  name: string    // "Ace of Spades"
}

export function makeCard(rank: number, suit: number): Card {
  const r = RANKS[rank % 13]
  const s = SUITS[suit % 4]
  return {
    rank: rank % 13,
    suit: suit % 4,
    image: `/cards/${r}${s}.png`,
    name: `${RANK_NAMES[rank % 13]} of ${['Spades', 'Hearts', 'Diamonds', 'Clubs'][suit % 4]}`,
  }
}

export const CARD_BACK = '/cards/back.png'

// ── Baccarat card value ──

function baccaratValue(card: Card): number {
  if (card.rank === 0) return 1       // Ace = 1
  if (card.rank >= 9) return 0        // 10, J, Q, K = 0
  return card.rank + 1                // 2-9 = face value (rank 1-8 → value 2-9)
}

function handTotal(cards: Card[]): number {
  let sum = 0
  for (const c of cards) sum += baccaratValue(c)
  return sum % 10
}

// ── Deterministic card generation from seed ──

function cardsFromSeed(seed: bigint, count: number): Card[] {
  const cards: Card[] = []
  let s = seed
  for (let i = 0; i < count; i++) {
    const rank = Number(s % 13n)
    s = s / 13n
    const suit = Number(s % 4n)
    s = s / 4n
    cards.push(makeCard(rank, suit))
  }
  return cards
}

// ── Dragon Tiger ──

export function dragonTigerCards(commitHash: string, diceResult: number): [Card, Card] {
  const seed = BigInt(commitHash)
  let dragonRank = Number(seed % 13n)
  let tigerRank = Number((seed / 13n) % 13n)
  const dragonSuit = Number((seed / 169n) % 4n)
  const tigerSuit = Number((seed / 676n) % 4n)

  if (diceResult === 0) {
    // Dragon wins
    if (dragonRank <= tigerRank) {
      dragonRank = (tigerRank + 1 + Number((seed / 2704n) % 11n)) % 13
      if (dragonRank <= tigerRank) dragonRank = 12
    }
  } else if (diceResult === 1) {
    // Tiger wins
    if (tigerRank <= dragonRank) {
      tigerRank = (dragonRank + 1 + Number((seed / 2704n) % 11n)) % 13
      if (tigerRank <= dragonRank) tigerRank = 12
    }
  } else {
    // Tie
    tigerRank = dragonRank
  }

  return [makeCard(dragonRank, dragonSuit), makeCard(tigerRank, tigerSuit)]
}

// ── Baccarat: Full rules implementation ──

export interface BaccaratResult {
  player: Card[]
  banker: Card[]
  playerInitialTotal: number  // first 2 cards only
  bankerInitialTotal: number  // first 2 cards only
  playerTotal: number         // final (after 3rd card if any)
  bankerTotal: number         // final
  isNatural: boolean
}

// Play one full baccarat hand from 6 cards, returning the result
function playBaccarat(cards: Card[]): BaccaratResult {
  // Deal initial 2 cards each: P1, B1, P2, B2
  const player: Card[] = [cards[0], cards[2]]
  const banker: Card[] = [cards[1], cards[3]]

  const pInitial = handTotal(player)
  const bInitial = handTotal(banker)
  let pTotal = pInitial
  let bTotal = bInitial

  // ── Natural check: either side has 8 or 9 → no more cards ──
  if (pTotal >= 8 || bTotal >= 8) {
    return { player, banker, playerInitialTotal: pInitial, bankerInitialTotal: bInitial, playerTotal: pTotal, bankerTotal: bTotal, isNatural: true }
  }

  // ── Player 3rd card rule ──
  let playerThirdValue = -1 // -1 = player stood

  if (pTotal <= 5) {
    // Player draws
    const p3 = cards[4]
    player.push(p3)
    playerThirdValue = baccaratValue(p3)
    pTotal = handTotal(player)
  }
  // Player 6-7: stand (no 3rd card)

  // ── Banker 3rd card rule ──
  if (playerThirdValue === -1) {
    // Player stood → Banker draws on 0-5, stands on 6-7
    if (bTotal <= 5) {
      banker.push(cards[5])
      bTotal = handTotal(banker)
    }
  } else {
    // Player drew 3rd card → Banker rule depends on banker total + player's 3rd card value
    const p3v = playerThirdValue
    let bankerDraws = false

    switch (bTotal) {
      case 0: case 1: case 2:
        bankerDraws = true
        break
      case 3:
        bankerDraws = p3v !== 8
        break
      case 4:
        bankerDraws = p3v >= 2 && p3v <= 7
        break
      case 5:
        bankerDraws = p3v >= 4 && p3v <= 7
        break
      case 6:
        bankerDraws = p3v === 6 || p3v === 7
        break
      case 7:
        bankerDraws = false
        break
    }

    if (bankerDraws) {
      banker.push(cards[5])
      bTotal = handTotal(banker)
    }
  }

  return { player, banker, playerInitialTotal: pInitial, bankerInitialTotal: bInitial, playerTotal: pTotal, bankerTotal: bTotal, isNatural: false }
}

// Determine outcome: 0=player wins, 1=banker wins, 2=tie
function baccaratOutcome(result: BaccaratResult): number {
  if (result.playerTotal > result.bankerTotal) return 0
  if (result.bankerTotal > result.playerTotal) return 1
  return 2
}

// Main entry: generate baccarat cards that match the on-chain dice result.
// Iterates seed offsets until baccarat rules produce the correct outcome.
export function baccaratCards(commitHash: string, diceResult: number): BaccaratResult {
  const baseSeed = BigInt(commitHash)

  // Try offsets until outcome matches
  for (let offset = 0; offset < 200; offset++) {
    const seed = baseSeed + BigInt(offset)
    const cards = cardsFromSeed(seed, 6)
    const result = playBaccarat(cards)
    const outcome = baccaratOutcome(result)

    if (outcome === diceResult) {
      return result
    }
  }

  // Fallback (extremely unlikely — 200 tries should always find a match)
  // Just return whatever we get
  const cards = cardsFromSeed(baseSeed, 6)
  return playBaccarat(cards)
}
