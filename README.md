# UPchain Casino

UPchain(Chain ID 31337) 프라이빗 체인에서 운영되는 온체인 카지노.
Commit-reveal 기반 7개 게임, 다중 토큰 배팅, UP 토큰 페이아웃.

## Play

**https://frontend-lime-phi-82.vercel.app**

> **화이트리스트 참가자 전용**: 등록된 본 계정 주소로만 배팅 가능합니다.
> 화이트리스트 추가가 필요하면 운영자에게 요청해주세요.

## Architecture

```
[Browser]                 [GCP: Backend]              [UPchain]
 Next.js + Wagmi    <->    Go + Redis           <->    UPchainCasino.sol
```

- **Contract**: Solidity 0.8.20, OpenZeppelin, Foundry
- **Backend**: Go dealer bot. Commit 서명 발급 + BetPlaced 감지 + settleBet 자동 실행
- **Frontend**: Next.js 16 + Viem/Wagmi. 7개 게임 UI

## Games

| Game | Type | Odds | Payout |
|------|------|------|--------|
| Coin Flip | 홀짝 | 50% | 1.92x |
| Dice | 주사위 1~6 복수 선택 | 16.7~83.3% | 1.15~5.76x |
| Double Dice | 두 주사위 합 2~12 | 2.8~16.7% | 5.76~34.56x |
| Roulette | 유럽식 룰렛 37칸 | 2.7~48.6% | 1.97~35.56x |
| Dragon Tiger | 카드 1장 대결 | 7.7~46.2% | 2.08~12.48x |
| Baccarat | 정식 바카라 (3rd card rule) | 7.7~46.2% | 2.08~12.48x |
| Hi-Lo | 승률 5~95% 슬라이더 | 5~95% | 1.01~19.20x |

House Edge: **4%** | Min Bet: **0.01 ETH** | Max Bet: **0.1 ETH** | Payout: **UP Token**

## Bet Flow

```
1. Player selects game + bet amount
2. Frontend -> POST /api/commit -> Backend generates secret + signature
3. Player -> placeBetETH TX (wallet signature)
4. Backend poller -> detects BetPlaced event on-chain
5. Backend settler -> sends settleBet TX (reveals secret)
6. Frontend -> polls BetSettled event -> displays result
```

## Contract

| Item | Value |
|------|-------|
| Address | [`0x2F3CBbc416B7a44BE58e72e0117DED6b3Ce84307`](https://explorer.defi.chainlight.com/address/0x2F3CBbc416B7a44BE58e72e0117DED6b3Ce84307) |
| Owner/Croupier | `0xD6cB49C33701aF43bA72038265c5A53e929A3C02` |
| Treasury | `0x4baeFE982d6cbd2B8880007A0f8cb9161bD020f3` (hardcoded, withdrawal destination) |
| Accepted Tokens | ETH, WETH, UP, SIDE, SEC, USP |
| Bet Expiration | 250 blocks (~12.5 min) |

## Project Structure

```
gamble/
├── src/UPchainCasino.sol       # Core contract
├── test/UPchainCasino.t.sol    # Foundry tests
├── script/Deploy.s.sol         # Deploy script
├── backend/                    # Go dealer bot
├── frontend/                   # Next.js UI
└── docs/                       # Documentation
```

## Documentation

- **[Game Rules](docs/GAMES.md)** — 7개 게임별 규칙, 확률, 배당, 플레이 방법
- **[Fairness & Security](docs/FAIRNESS.md)** — Commit-reveal 공정성 모델, 서명 검증, 사후 검증 방법
- **[Backend Spec](backend/README.md)** — API, 상태머신, Redis, 정산 로직, 복구
- **[Frontend Spec](frontend/README.md)** — 컴포넌트 구조, 게임 UI, 체인 연동
