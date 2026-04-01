# Frontend Specification — UPchain Casino

## Overview

Next.js + Viem/Wagmi 기반 단일 페이지 카지노 UI.
홀짝(Coin Flip) + 주사위(Dice) 두 게임만 구현.
Vercel 배포, 백엔드(GCP)와 API 통신.

## Tech Stack

| 항목 | 선택 |
|------|------|
| Framework | Next.js 14 (App Router) |
| Web3 | Viem + Wagmi v2 |
| Wallet | MetaMask (window.ethereum) |
| Styling | Tailwind CSS |
| State | React useState/useEffect (Zustand 불필요 — 단일 페이지) |
| 배포 | Vercel |

## Page Structure

단일 페이지 (`/`). 탭으로 게임 전환.

```
┌─────────────────────────────────────────────────┐
│  UPchain Casino                    [Connect Wallet] │
├─────────────────────────────────────────────────┤
│  [Coin Flip]  [Dice]                              │
├─────────────────────────────────────────────────┤
│                                                   │
│              ┌─────────────┐                      │
│              │  Game Area  │                      │
│              │  (결과 표시)  │                      │
│              └─────────────┘                      │
│                                                   │
│  Bet Amount: [0.01 ▾] ETH                        │
│  Your Pick:  [Heads / Tails]  or  [1-6]          │
│                                                   │
│  Expected Win: 192.83 UP                          │
│                                                   │
│  [ Place Bet ]                                    │
│                                                   │
├─────────────────────────────────────────────────┤
│  Recent Bets                                      │
│  ┌──────┬────────┬──────┬────────┬───────────┐   │
│  │ Game │ Result │ Bet  │ Payout │ Status    │   │
│  ├──────┼────────┼──────┼────────┼───────────┤   │
│  │ Coin │ Heads  │ 0.01 │ 192 UP │ ✅ Won    │   │
│  │ Dice │ 3      │ 0.01 │ 0 UP   │ ❌ Lost   │   │
│  └──────┴────────┴──────┴────────┴───────────┘   │
└─────────────────────────────────────────────────┘
```

## Chain Configuration

```typescript
const upchain = {
  id: 31337,
  name: 'UPchain',
  network: 'upchain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.defi.chainlight.com'] },
  },
}
```

## Contract Addresses (env-driven)

```typescript
// Source of truth: environment variables. No hardcoded addresses.
const CASINO = process.env.NEXT_PUBLIC_CASINO_ADDRESS!
const UP_TOKEN = '0x65B7Bf774A173130a66967f5013c7652BACf022B' // fixed on UPchain
```

## State Machine (per bet cycle)

```
IDLE
  → user clicks "Place Bet"
FETCHING_COMMIT
  → POST /api/commit → receive {commit, commitLastBlock, v, r, s}
  → error → IDLE (show error toast)
WALLET_CONFIRM
  → wagmi writeContract(placeBetETH) → MetaMask popup
  → user reject → IDLE
TX_PENDING
  → waitForTransactionReceipt
  → confirmed → WAITING_RESULT
  → failed → IDLE (show error)
WAITING_RESULT
  → poll for BetSettled event (eth_getLogs every 3s)
  → BetSettled received → RESULT
  → timeout 60s → IDLE (show "check history")
RESULT
  → show win/loss animation
  → 3s delay → IDLE
```

## API Integration

### Backend URL

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
```

### POST /api/commit

```typescript
async function fetchCommit(params: {
  player: string   // connected wallet address
  token: string    // "0x0000000000000000000000000000000000000000" (ETH)
  amount: string   // wei string, e.g. "10000000000000000"
  betMask: string  // "1" or "2" (coin), "1"-"63" (dice bitmask)
  modulo: string   // "2" (coin) or "6" (dice)
}): Promise<{
  commit: string
  commitLastBlock: number
  v: number
  r: string
  s: string
}>
```

### GET /api/history

```typescript
async function fetchHistory(): Promise<{
  bets: Array<{
    commit: string
    player: string
    token: string
    amount: string
    modulo: string
    betMask: string
    eventType: 'settled' | 'refunded'
    diceResult: number
    won: boolean
    payoutUP: string
    block: number
    txHash: string
  }>
}>
```

## Game Logic

### Coin Flip (modulo = 2)

| 선택 | betMask | 의미 |
|------|---------|------|
| Heads | 1 (0b01) | dice=0이면 승 |
| Tails | 2 (0b10) | dice=1이면 승 |

승리 시 payout: `amount × 0.96 × 2 = 1.92x` (UP 환산)

### Dice (modulo = 6)

| 선택 | betMask | 의미 |
|------|---------|------|
| 1 | 1 (0b000001) | dice=0이면 승 |
| 2 | 2 (0b000010) | dice=1이면 승 |
| 3 | 4 (0b000100) | dice=2이면 승 |
| 4 | 8 (0b001000) | dice=3이면 승 |
| 5 | 16 (0b010000) | dice=4이면 승 |
| 6 | 32 (0b100000) | dice=5이면 승 |

단일 숫자 승리 시 payout: `amount × 0.96 × 6 = 5.76x` (UP 환산)

복수 선택 가능 (betMask = OR):
- 1,3,5 선택 → betMask = 1+4+16 = 21
- 승리 시 payout: `amount × 0.96 × 6/3 = 1.92x`

## Contract Interaction

### placeBetETH

```typescript
const { writeContract } = useWriteContract()

writeContract({
  address: CASINO,
  abi: casinoAbi,
  functionName: 'placeBetETH',
  args: [
    BigInt(betMask),
    BigInt(modulo),
    BigInt(commitLastBlock),
    BigInt(commit),
    v,
    r as `0x${string}`,
    s as `0x${string}`,
  ],
  value: parseEther(betAmount),
})
```

### BetSettled Event Polling

```typescript
// poll every 3s after placeBet confirmed
const logs = await publicClient.getLogs({
  address: CASINO,
  event: parseAbiItem(
    'event BetSettled(uint256 indexed commit, address indexed player, uint256 diceResult, uint256 payoutUP)'
  ),
  args: { commit: BigInt(commitHash) },
  fromBlock: placeBetBlock,
  toBlock: 'latest',
})
```

### previewWinUP (read-only)

```typescript
const preview = await publicClient.readContract({
  address: CASINO,
  abi: casinoAbi,
  functionName: 'previewWinUP',
  args: [
    ETH_SENTINEL,           // token
    parseEther(betAmount),  // amount
    BigInt(modulo),
    BigInt(rollUnder),      // popcount of betMask
  ],
})
// preview = UP amount (18 decimals)
```

## Bet Amount Options

드롭다운 또는 프리셋 버튼:

| 표시 | wei | USD 가치 (~) |
|------|-----|-------------|
| 0.01 ETH | 10000000000000000 | ~$20 |
| 0.02 ETH | 20000000000000000 | ~$40 |
| 0.05 ETH | 50000000000000000 | ~$100 |
| 0.1 ETH | 100000000000000000 | ~$200 |

min: 0.01 ETH ($20), max: 0.1 ETH ($200)

## UI Components

### 1. Header
- 타이틀 "UPchain Casino"
- Connect Wallet 버튼 (Wagmi useConnect/useAccount)
- 연결된 주소 표시 (truncated)
- ETH 잔고 표시

### 2. Game Tabs
- [Coin Flip] [Dice] 탭 전환
- 선택된 탭 하이라이트

### 3. Coin Flip Game
- 두 개의 큰 버튼: 🪙 Heads / 🪙 Tails
- 선택 시 하이라이트
- 결과 시: 동전 뒤집기 애니메이션 (CSS) → 결과 표시

### 4. Dice Game
- 6개의 주사위 버튼 (⚀⚁⚂⚃⚄⚅)
- 복수 선택 가능 (토글)
- 선택된 번호 하이라이트
- 결과 시: 주사위 굴리기 애니메이션 → 결과 표시

### 5. Bet Controls
- Bet Amount 드롭다운/프리셋
- Expected Win 표시 (previewWinUP 호출)
- "Place Bet" 버튼 (상태에 따라 텍스트 변경)
  - IDLE: "Place Bet"
  - FETCHING_COMMIT: "Getting ticket..."
  - WALLET_CONFIRM: "Confirm in wallet..."
  - TX_PENDING: "Placing bet..."
  - WAITING_RESULT: "Rolling..."
  - RESULT: "🎉 You won!" / "😢 Better luck next time"

### 6. Recent Bets Table
- 최근 10건 표시
- GET /api/history 폴링 (10초 주기)
- 컬럼: Game | Result | Bet | Payout | Status
- 내 배팅만 필터 (connected wallet)

## Error Handling

| 에러 | 처리 |
|------|------|
| 지갑 미연결 | "Connect wallet first" 표시, 버튼 비활성 |
| 잘못된 체인 | "Switch to UPchain" 버튼 표시 |
| API /api/commit 실패 | toast "Backend unavailable" |
| 컨트랙트 revert | toast 에러 메시지 표시 (e.g. "Not whitelisted") |
| 정산 타임아웃 (60s) | toast "Settlement pending, check history" |
| 잔고 부족 | "Insufficient ETH" 표시 |

## File Structure

```
frontend/
├── app/
│   ├── layout.tsx          ← HTML head, Wagmi provider, Tailwind
│   ├── page.tsx            ← 메인 페이지
│   └── providers.tsx       ← WagmiConfig, QueryClient
├── components/
│   ├── Header.tsx          ← 지갑 연결, 잔고
│   ├── GameTabs.tsx        ← Coin Flip / Dice 탭
│   ├── CoinFlip.tsx        ← 홀짝 게임 UI
│   ├── Dice.tsx            ← 주사위 게임 UI
│   ├── BetControls.tsx     ← 금액 선택, Place Bet 버튼
│   ├── ResultDisplay.tsx   ← 결과 애니메이션
│   └── RecentBets.tsx      ← 히스토리 테이블
├── lib/
│   ├── constants.ts        ← 주소, ABI, 체인 설정
│   ├── api.ts              ← fetchCommit, fetchHistory
│   └── utils.ts            ← betMask 계산, 포맷팅
├── public/
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## Wagmi/Viem Setup

```typescript
// providers.tsx
const config = createConfig({
  chains: [upchain],
  transports: {
    [upchain.id]: http('https://rpc.defi.chainlight.com'),
  },
  connectors: [injected()],
})
```

## Key UX Decisions

1. **ETH only (MVP)**: 토큰 배팅은 approve TX 필요 → UX 복잡. ETH만 지원.
2. **결과 폴링**: WebSocket 미지원이므로 BetSettled 이벤트를 3초 폴링.
3. **애니메이션**: CSS transition으로 간단히. 결과가 정해진 후 역산 애니메이션.
4. **모바일 반응형**: Tailwind `sm:`, `md:` breakpoint.

## Environment Variables (Source of Truth)

```
# Required
NEXT_PUBLIC_CASINO_ADDRESS=0x2F3CBbc416B7a44BE58e72e0117DED6b3Ce84307
NEXT_PUBLIC_API_URL=https://your-gcp-domain.com    # local: http://localhost:8080

# Optional (defaults)
NEXT_PUBLIC_CHAIN_RPC=https://rpc.defi.chainlight.com
```

모든 주소/URL은 env에서 읽음. 코드에 하드코딩 금지 (UP_TOKEN 제외 — 체인 고정).
