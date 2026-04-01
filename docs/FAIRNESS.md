# Fairness & Security

## 공정성 모델

UPchain Casino는 **Commit-Reveal** 방식으로 결과를 생성합니다.

### 결과 생성 과정

```
1. 백엔드가 secret(32바이트 난수)을 생성
2. commit = keccak256(secret) → 유저에게 전달
3. 유저가 commit과 함께 배팅 TX를 온체인에 전송
4. 배팅이 블록에 포함됨 → blockhash 확정
5. 백엔드가 secret을 공개하며 settleBet 호출
6. 결과 = keccak256(secret, blockhash) % modulo
```

### 왜 결과를 조작할 수 없는가

- **secret은 commit에 묶여 있습니다**: `commit = keccak256(secret)`이므로, 배팅이 접수된 후 secret을 변경할 수 없습니다.
- **blockhash는 배팅 이후에 결정됩니다**: 유저가 배팅한 블록의 해시는 배팅 시점에 아직 존재하지 않으므로, 백엔드가 결과를 미리 알 수 없습니다.
- **두 엔트로피 소스의 결합**: secret(백엔드) + blockhash(체인) 둘 다 알아야 결과를 예측할 수 있습니다.

### Trust Model

이 시스템은 **완전한 trustless 시스템이 아닙니다**. 알려진 제한사항:

1. **정산 권한**: settleBet은 croupier(하우스)만 호출 가능합니다. 이론적으로 하우스가 불리한 결과의 정산을 거부할 수 있습니다. 이 경우 유저는 250블록(~12.5분) 후 `refundBet`으로 원금을 100% 돌려받을 수 있습니다.

2. **블록 시퀀서**: UPchain은 단일 시퀀서(Admin)가 블록을 생성합니다. 이론적으로 시퀀서가 blockhash를 선택적으로 생성할 수 있으나, 카지노 운영자 ≠ 시퀀서이므로 공모 없이는 불가능합니다.

### 서명 검증

모든 배팅에는 9개 필드가 서명에 바인딩됩니다:

```
address(this)     → 다른 컨트랙트에서 재사용 불가
block.chainid     → 다른 체인에서 리플레이 불가
commitLastBlock   → 만료 시점 고정
commit            → secret에 바인딩
msg.sender        → 다른 유저가 가로채기 불가
token             → 배팅 토큰 변조 불가
amount            → 배팅 금액 변조 불가
betMask           → 선택 변조 불가
modulo            → 게임 종류 변조 불가
```

### 컨트랙트 보안

| 보호 장치 | 설명 |
|-----------|------|
| ReentrancyGuard | 재진입 공격 방지 (OpenZeppelin) |
| SafeERC20 | 토큰 전송 안전성 (OpenZeppelin) |
| lockedInBets | 하우스 파산 방지 — 활성 배팅의 최대 지급액 사전 확보 |
| lockedRefunds | 환불 reserve 보호 — owner가 활성 배팅 원금을 인출 불가 |
| 오라클 sanity bounds | 비정상 가격($0.0001~$1,000,000 범위만 허용) |
| 화이트리스트 | 등록된 17명만 배팅 가능 |

### 사후 검증

모든 배팅 결과는 온체인에 영구 기록됩니다:

```
BetPlaced 이벤트: commit, player, token, amount, modulo, rollUnder
BetSettled 이벤트: commit, player, diceResult, payoutUP
```

누구나 온체인 이벤트를 조회하여 결과의 정당성을 검증할 수 있습니다:
1. BetPlaced에서 commit 확인
2. settleBet TX에서 reveal(secret) 추출
3. `keccak256(reveal, blockhash(placeBlockNumber)) % modulo` 재계산
4. BetSettled의 diceResult와 비교
