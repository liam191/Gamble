# Dealer Bot — Backend Specification (v5 Final)

## Overview

Go 기반 딜러 봇. 커밋 서명 발급 API + BetPlaced 이벤트 폴링 + settleBet TX 실행.
GCP 프리티어에서 Docker로 배포.

## Architecture

```
[Frontend]                    [GCP: Dealer Bot]                [UPchain]
    │                              │                               │
    ├─ POST /api/commit ─────────→ │                               │
    │   {player,token,amount,      ├─ secret 생성 + 서명           │
    │    betMask,modulo}           ├─ Redis HSET (status=issued)   │
    │  ←─ {commit,clb,v,r,s} ─────┤                               │
    │                              │                               │
    ├─ placeBet TX ──────────────────────────────────────────────→ │
    │                              │                               │
    │                              ├─ Poller: BetPlaced ──────────→│
    │                              │   status: issued → placed     │
    │                              │                               │
    │                              ├─ Worker: settleBet TX ───────→│
    │                              │   status: placed → sent       │
    │                              │   (blocks until resolved)     │
    │                              │   status: sent → confirmed    │
    │                              │                               │
    │  ←─ BetSettled (poll) ───────┤                               │
```

## 1. HTTP API

### `POST /api/commit`

Request (JSON):
```json
{
  "player": "0xCAFE...",
  "token": "0x0000000000000000000000000000000000000000",
  "amount": "10000000000000000",
  "betMask": "1",
  "modulo": "2"
}
```

Response:
```json
{
  "commit": "0xabc...123",
  "commitLastBlock": 78500,
  "v": 28,
  "r": "0x7a...1c",
  "s": "0x9b...3d"
}
```

Headers: `Cache-Control: no-store`
Validation: player (address), token (6종), amount (>0), betMask (>0), modulo (2-100).
Rate limit: IP당 10 req/min.

### `GET /api/status`

```json
{
  "status": "ok",
  "block": 78500,
  "pendingBets": 3,
  "queueLength": 1,
  "nonce": 42,
  "uptime": "2h15m"
}
```

### `GET /api/history`

BetSettled/BetRefunded 온체인 이벤트 기반 (optimistic 아님).

## 2. Commit State Machine

```
issued ──→ placed ──→ sent ──→ confirmed
                          ├──→ reverted ──→ retry ──→ sent (max 3)
                          │                       └──→ abandoned
                          └──→ dropped ──→ placed (requeue, same nonce)
issued ──→ expired
placed ──→ abandoned (blockhash unavailable = 정산 윈도우 놓침)
```

**비종료 상태 4개**: issued, placed, sent, failed — 아직 처리가 필요한 상태.
**종료 상태 3개**: confirmed, abandoned, expired — TTL 후 자동 삭제.

### Redis Hash: `commit:{commitHash}`

| Field | 설명 |
|-------|------|
| secret | 32 bytes hex |
| status | issued / placed / sent / confirmed / failed / abandoned / expired |
| player | address |
| token | address |
| amount | uint256 string |
| betMask | uint256 string |
| modulo | uint256 string |
| commitLastBlock | uint64 |
| placeBlock | uint64 (log.BlockNumber) |
| txHash | hex string (sent 이후) |
| retryCount | int |
| issuedAt | unix timestamp |

### TTL 정책

| 상태 | TTL |
|------|-----|
| issued | 24시간 |
| placed, sent, failed | 없음 |
| confirmed | 7일 재설정 |
| abandoned | 7일 재설정 |
| expired | 24시간 재설정 |

### Redis 쓰기 규칙

모든 상태 전이는 Redis write 성공을 확인.
실패 시 fatal 로그 + worker 중단.
복합 전이는 MULTI/EXEC 원자화.
조건부 전이(cleanup)는 Lua CAS.

```go
// 원자적 confirmed 전이
func atomicConfirm(commit string) error {
    pipe := redis.TxPipeline()
    pipe.HSet(ctx, "commit:"+commit, "status", "confirmed")
    pipe.HDel(ctx, "commit:"+commit, "secret")
    pipe.Expire(ctx, "commit:"+commit, 7*24*time.Hour)
    _, err := pipe.Exec(ctx)
    return err
}

// CAS: 현재 상태가 expected일 때만 전이 (Lua)
var casTransitionScript = redis.NewScript(`
    local key = KEYS[1]
    local expected = ARGV[1]
    local current = redis.call('HGET', key, 'status')
    if current == expected then
        for i = 2, #ARGV, 2 do
            redis.call('HSET', key, ARGV[i], ARGV[i+1])
        end
        return 1
    end
    return 0
`)

func casTransition(key, expected string, fields ...string) (bool, error) {
    args := append([]string{expected}, fields...)
    result, err := casTransitionScript.Run(ctx, redis, []string{key}, args).Int()
    return result == 1, err
}
```

## 3. Event Poller

### 3.1 BetPlaced Poller (3초)

```go
for range ticker.C {
    currentBlock := eth.BlockNumber()
    if currentBlock <= lastScannedBlock { continue }

    logs, err := eth.GetLogs(BetPlacedTopic, lastScannedBlock+1, currentBlock)
    if err != nil {
        log.Error("getLogs failed", err)
        continue  // 커서 미전진, 재시도
    }

    allOk := true
    for _, log := range logs {
        commit := log.Topics[1]

        // CAS: issued → placed (다른 goroutine이 이미 바꿨으면 skip)
        ok, err := casTransition("commit:"+commit, "issued",
            "status", "placed",
            "placeBlock", fmt.Sprint(log.BlockNumber))
        if err != nil {
            log.Fatal("Redis CAS failed", err)
        }
        if !ok { continue }  // 이미 다른 상태 — dedupe

        mustWrite(redis.Persist("commit:"+commit))
        settleCh <- &BetEvent{Commit: commit, PlaceBlock: log.BlockNumber}
    }

    // GetLogs 성공 → 커서 전진 (빈 로그도 전진)
    if allOk {
        mustWrite(redis.Set("poller:lastScannedBlock", currentBlock))
        lastScannedBlock = currentBlock
    }
}
```

### 3.2 History Poller (3초)

별도 goroutine. BetSettled + BetRefunded 이벤트 → `history:{commit}` (TTL 7일).

**Join 전략**: BetSettled 이벤트에는 token/amount가 없음 (commit, player, diceResult, payoutUP만).
history 저장 시 `commit:{hash}` Redis record에서 token, amount, modulo를 읽어서 합침.
`commit:{hash}`가 이미 만료됐으면 BetPlaced 이벤트를 재조회하여 보충.

```go
func saveHistory(commitHash string, settled BetSettledEvent) {
    // commit record에서 bet 파라미터 조회
    token := redis.HGet("commit:"+commitHash, "token")
    amount := redis.HGet("commit:"+commitHash, "amount")
    modulo := redis.HGet("commit:"+commitHash, "modulo")

    // 만료된 경우 BetPlaced 이벤트에서 복원
    if token == "" {
        placedLog := eth.GetLogs(BetPlacedTopic, settled.BlockNumber-250, settled.BlockNumber,
            commitHash)  // topic[1] filter
        if len(placedLog) > 0 {
            token, amount, modulo = decodeBetPlacedData(placedLog[0])
        }
    }

    history := History{
        Commit:     commitHash,
        Player:     settled.Player,
        Token:      token,
        Amount:     amount,
        DiceResult: settled.DiceResult,
        Won:        settled.PayoutUP > 0,
        PayoutUP:   settled.PayoutUP,
        Block:      settled.BlockNumber,
        TxHash:     settled.TxHash,
    }
    mustWrite(redis.Set("history:"+commitHash, json.Marshal(history), 7*24*time.Hour))
}
```

### 3.3 issued → expired Cleanup (60초)

```go
for range cleanupTicker.C {
    currentBlock := eth.BlockNumber()

    for _, key := range redis.ScanByStatus("issued") {
        clb := redis.HGetUint64(key, "commitLastBlock")
        if currentBlock <= clb + 10 { continue }  // grace +10블록

        commit := extractCommit(key)
        betAmount := eth.CallBetsAmount(commit)

        if betAmount > 0 {
            // 배팅 존재 — CAS: issued → placed 복구
            placeBlock := findPlaceBlockFromLogs(commit)
            ok, err := casTransition(key, "issued",
                "status", "placed",
                "placeBlock", fmt.Sprint(placeBlock))
            if err != nil {
                log.Fatal("Redis CAS failed in cleanup", err)
            }
            if ok {
                mustWrite(redis.Persist(key))
                settleCh <- &BetEvent{Commit: commit, PlaceBlock: placeBlock}
            }
        } else {
            // CAS: issued → expired
            ok, err := casTransition(key, "issued", "status", "expired")
            if err != nil {
                log.Fatal("Redis CAS failed in cleanup", err)
            }
            if ok {
                mustWrite(redis.Expire(key, 24*time.Hour))
            }
        }
    }
}
```

## 4. Settlement Worker (Single Goroutine, Fully Blocking)

**핵심 원칙:**
1. 한 tx의 최종 결과가 확정될 때까지 다음 tx를 절대 보내지 않음.
2. Nonce 소유권은 이 goroutine에만 존재.
3. Redis write 실패는 fatal.

```go
func settlementWorker() {
    for bet := range settleCh {
        // 1. Dedupe
        status := redis.HGet("commit:"+bet.Commit, "status")
        if status != "placed" && status != "failed" {
            continue
        }

        // 2. Secret
        secret := redis.HGet("commit:"+bet.Commit, "secret")
        if secret == "" {
            mustWrite(redis.HSet("commit:"+bet.Commit, "status", "abandoned"))
            mustWrite(redis.Expire("commit:"+bet.Commit, 7*24*time.Hour))
            log.Error("secret missing", bet.Commit)
            continue
        }

        // 3. N+1 블록 대기 — settleBet은 placeBlock 다음 블록부터만 유효
        for eth.BlockNumber() <= bet.PlaceBlock {
            time.Sleep(500 * time.Millisecond)
        }

        // 4. Blockhash — 없으면 정산 윈도우 놓침
        blockHash := eth.GetBlockHash(bet.PlaceBlock)
        if blockHash == (common.Hash{}) {
            mustWrite(redis.HSet("commit:"+bet.Commit, "status", "abandoned"))
            mustWrite(redis.Expire("commit:"+bet.Commit, 7*24*time.Hour))
            log.Error("blockhash unavailable, bet abandoned (user can refundBet)", bet.Commit)
            continue
        }

        // 4. TX 빌드 + 전송
        calldata := buildSettleBetCalldata(secret, blockHash)
        tx := buildTx(calldata, localNonce, gasPrice)
        txHash, err := eth.SendRawTx(tx)
        if err != nil {
            log.Error("sendRawTx failed", err)
            resyncNonce()
            settleCh <- bet
            time.Sleep(3 * time.Second)
            continue
        }

        // 5. placed → sent
        mustWrite(redis.HSet("commit:"+bet.Commit, "status", "sent", "txHash", txHash))

        // 6. ★ 결과 확정까지 블록킹 ★
        result := resolveTransaction(txHash, calldata, localNonce)

        // 7. 결과 처리 (worker 전용 — nonce 증가 포함)
        applyResult(bet.Commit, result, bet)
    }
}
```

### applyResult — worker와 recovery 공용

```go
// applyResult: 상태 전이 + nonce 관리. worker 전용.
func applyResult(commit, result string, bet *BetEvent) {
    applyStateTransition(commit, result, bet)
    // Nonce는 worker에서만 증가
    if result == "confirmed" || result == "reverted" {
        localNonce++
    }
}

// applyRecoveryResult: 상태 전이만. nonce는 건드리지 않음.
// recovery 시 nonce는 이미 eth_getTransactionCount에 반영되어 있으므로.
func applyRecoveryResult(commit, result string, bet *BetEvent) {
    applyStateTransition(commit, result, bet)
}

// applyStateTransition: 공용 상태 전이 로직 (nonce 무관).
func applyStateTransition(commit, result string, bet *BetEvent) {
    switch result {
    case "confirmed":
        mustWrite(atomicConfirm(commit))
        log.Info("settled", commit)

    case "reverted":
        key := "commit:" + commit
        retryCount := mustWriteInt(redis.HIncrBy(key, "retryCount", 1))
        if retryCount >= 3 {
            mustWrite(redis.HSet(key, "status", "abandoned"))
            mustWrite(redis.Expire(key, 7*24*time.Hour))
            log.Error("abandoned after 3 retries", commit)
        } else {
            mustWrite(redis.HSet(key, "status", "failed"))
            if bet != nil { settleCh <- bet }
        }

    case "dropped":
        mustWrite(redis.HSet("commit:"+commit, "status", "placed"))
        if bet != nil { settleCh <- bet }
        log.Warn("tx dropped, requeuing", commit)
    }
}
```

### resolveTransaction

```go
func resolveTransaction(txHash string, calldata []byte, nonce uint64) string {
    // Phase 1: 일반 대기 (30초, ~10블록)
    for i := 0; i < 10; i++ {
        time.Sleep(3 * time.Second)
        receipt := eth.GetTransactionReceipt(txHash)
        if receipt != nil {
            if receipt.Status == 1 { return "confirmed" }
            return "reverted"
        }
    }

    // Phase 2: TX 존재 확인 + 연장 대기 (최대 5분)
    deadline := time.Now().Add(5 * time.Minute)
    for time.Now().Before(deadline) {
        receipt := eth.GetTransactionReceipt(txHash)
        if receipt != nil {
            if receipt.Status == 1 { return "confirmed" }
            return "reverted"
        }

        tx := eth.GetTransactionByHash(txHash)
        if tx == nil {
            return "dropped"
        }

        log.Warn("tx still pending", txHash)
        time.Sleep(5 * time.Second)
    }

    // Phase 3: 5분 초과 — 같은 settleBet calldata를 높은 gas로 재전송
    log.Warn("tx stuck 5min, sending replacement with same calldata", txHash)
    return sendReplacement(txHash, calldata, nonce)
}
```

### sendReplacement — 같은 settleBet calldata + 높은 gas

원본과 동일한 settleBet 호출을 같은 nonce + 2배 gas로 재전송.
어느 tx가 채굴되든 settle이 실행됨 → "replaced" 상태 불필요.

```go
// nonce를 명시적으로 받음 — recovery 중에는 localNonce가 stale할 수 있으므로.
// 정상 운영 시: localNonce 전달. recovery 시: 원본 tx에서 읽은 nonce 전달.
func sendReplacement(stuckTxHash string, calldata []byte, nonce uint64) string {
    replaceTx := buildTx(calldata, nonce, gasPrice*2)
    replaceHash, err := eth.SendRawTx(replaceTx)
    if err != nil {
        log.Error("replacement send failed, re-checking original tx", err)
        // replacement 전송 실패 — 원본만 재확인 (replacement hash 없음)
        return recheckInFlight(stuckTxHash, "")
    }

    // 원본 또는 replacement 중 하나가 확정될 때까지 대기
    for i := 0; i < 20; i++ {
        time.Sleep(3 * time.Second)

        origReceipt := eth.GetTransactionReceipt(stuckTxHash)
        if origReceipt != nil {
            if origReceipt.Status == 1 { return "confirmed" }
            return "reverted"
        }

        replaceReceipt := eth.GetTransactionReceipt(replaceHash)
        if replaceReceipt != nil {
            if replaceReceipt.Status == 1 { return "confirmed" }
            return "reverted"
        }
    }

    // 비상: 둘 다 60초 내 미확정 — 양쪽 모두 재확인
    log.Error("both txs unresolved, re-checking both")
    return recheckInFlight(stuckTxHash, replaceHash)
}

// recheckInFlight: 원본과 replacement 둘 다 확인.
// 어느 한 쪽이라도 pending이면 dropped로 내리지 않음.
func recheckInFlight(origHash, replaceHash string) string {
    log.Warn("rechecking both in-flight txs", origHash, replaceHash)

    for i := 0; i < 20; i++ {
        time.Sleep(15 * time.Second)

        // 원본 확정?
        origReceipt := eth.GetTransactionReceipt(origHash)
        if origReceipt != nil {
            if origReceipt.Status == 1 { return "confirmed" }
            return "reverted"
        }

        // Replacement 확정? (replaceHash가 있을 때만)
        if replaceHash != "" {
            replaceReceipt := eth.GetTransactionReceipt(replaceHash)
            if replaceReceipt != nil {
                if replaceReceipt.Status == 1 { return "confirmed" }
                return "reverted"
            }
        }

        // 둘 중 하나라도 pending이면 계속 대기
        origExists := eth.GetTransactionByHash(origHash) != nil
        replaceExists := replaceHash != "" && eth.GetTransactionByHash(replaceHash) != nil

        if origExists || replaceExists {
            log.Warn("in-flight tx still pending", "orig", origExists, "replace", replaceExists)
            continue
        }

        // 둘 다 사라짐
        return "dropped"
    }

    // 5분 추가 대기 후에도 pending — 자동 복구 금지
    log.Fatal("MANUAL INTERVENTION: in-flight tx pending over 10min, status=sent preserved")
    return "" // unreachable (log.Fatal exits)
}
```

### mustWrite

```go
func mustWrite(err error) {
    if err != nil {
        log.Fatal("FATAL: Redis write failed, stopping worker", err)
    }
}
```

## 5. Nonce Management

```
1. Recovery 완료 후: eth_getTransactionCount("latest") → localNonce (최종 동기화)
2. TX 전송: localNonce 사용
3. confirmed/reverted: localNonce++ (worker만)
4. dropped: localNonce 유지 (같은 nonce 재사용)
5. send 실패: resyncNonce()
6. 소유권: settlement worker goroutine 단독
7. Recovery 중: nonce 증가 안 함 (chain count가 이미 반영)
```

## 6. Startup Recovery

```go
func recoverOnStartup() {
    currentBlock := eth.BlockNumber()

    // handled: step 1에서 처리한 commit은 step 2에서 skip (중복 큐잉 방지)
    handled := make(map[string]bool)

    // 1. status=sent 복구 (상태 정리만, nonce는 건드리지 않음)
    for _, key := range redis.ScanByStatus("sent") {
        commit := extractCommit(key)
        txHash := redis.HGet(key, "txHash")
        log.Warn("recovery: resolving in-flight tx (may block up to 5min)", commit, txHash)

        receipt := eth.GetTransactionReceipt(txHash)
        if receipt != nil {
            if receipt.Status == 1 {
                applyRecoveryResult(commit, "confirmed", nil)
                log.Info("recovery: sent→confirmed", commit)
            } else {
                applyRecoveryResult(commit, "reverted", recoverBetEvent(key))
                log.Info("recovery: sent→reverted", commit)
            }
            handled[commit] = true
            continue
        }

        // Receipt 없음 — tx 존재 확인
        tx := eth.GetTransactionByHash(txHash)
        if tx != nil {
            // TX pending — 원본 tx에서 nonce를 읽어서 replacement에 사용
            log.Warn("recovery: sent tx still pending, blocking until resolved", commit)
            origNonce := tx.Nonce()  // 원본 tx의 실제 nonce
            secret := redis.HGet(key, "secret")
            blockHash := eth.GetBlockHash(redis.HGetUint64(key, "placeBlock"))
            calldata := buildSettleBetCalldata(secret, blockHash)
            result := resolveTransaction(txHash, calldata, origNonce)
            applyRecoveryResult(commit, result, recoverBetEvent(key))
            handled[commit] = true
        } else {
            // TX dropped
            mustWrite(redis.HSet(key, "status", "placed"))
            settleCh <- recoverBetEvent(key)
            handled[commit] = true
            log.Info("recovery: sent→placed (dropped)", commit)
        }
    }

    // 2. 최근 250블록 BetPlaced 재스캔
    fromBlock := currentBlock - 250
    if fromBlock < 0 { fromBlock = 0 }
    logs := eth.GetLogs(BetPlacedTopic, fromBlock, currentBlock)

    for _, log := range logs {
        commit := log.Topics[1]

        // step 1에서 이미 처리한 commit은 skip
        if handled[commit] { continue }

        betAmount := eth.CallBetsAmount(commit)
        if betAmount == 0 { continue }

        status := redis.HGet("commit:"+commit, "status")
        secret := redis.HGet("commit:"+commit, "secret")

        switch {
        case secret != "" && (status == "placed" || status == "failed" || status == ""):
            mustWrite(redis.HSet("commit:"+commit,
                "status", "placed", "placeBlock", log.BlockNumber))
            mustWrite(redis.Persist("commit:"+commit))
            settleCh <- &BetEvent{Commit: commit, PlaceBlock: log.BlockNumber}
            log.Info("recovery: requeued", commit)

        case secret == "" && status != "confirmed":
            mustWrite(redis.HSet("commit:"+commit, "status", "abandoned"))
            mustWrite(redis.Expire("commit:"+commit, 7*24*time.Hour))
            log.Warn("recovery: no secret", commit)
        }
    }

    // 3. Nonce 최종 동기화 — recovery 중 채굴된 tx 반영
    localNonce = eth.GetTransactionCount(croupierAddr, "latest")
    log.Info("recovery complete", "nonce", localNonce)
}
```

## 7. Signature Generation

```go
func signCommit(
    casinoAddr common.Address, chainId *big.Int,
    commitLastBlock, commit *big.Int,
    player, token common.Address,
    amount, betMask, modulo *big.Int,
) (v uint8, r, s [32]byte) {
    packed := abiEncode(
        casinoAddr, chainId, commitLastBlock, commit,
        player, token, amount, betMask, modulo,
    )
    msgHash := crypto.Keccak256(packed)
    prefixed := crypto.Keccak256(
        []byte("\x19Ethereum Signed Message:\n32"), msgHash,
    )
    sig, _ := crypto.Sign(prefixed, croupierKey)
    copy(r[:], sig[0:32])
    copy(s[:], sig[32:64])
    v = sig[64] + 27
    return
}
```

## 8. Configuration

```go
type Config struct {
    RPCURL       string        `env:"CASINO_RPC_URL"       default:"https://rpc.defi.chainlight.com"`
    ChainID      int64         `env:"CASINO_CHAIN_ID"      default:"31337"`
    CasinoAddr   string        `env:"CASINO_CONTRACT"`
    PrivateKey   string        `env:"CASINO_PRIVATE_KEY"`
    RedisURL     string        `env:"CASINO_REDIS_URL"     default:"redis:6379"`
    Port         int           `env:"CASINO_PORT"          default:"8080"`
    PollInterval time.Duration `env:"CASINO_POLL_INTERVAL" default:"3s"`
    GasPrice     int64         `env:"CASINO_GAS_PRICE"     default:"7"`
    GasLimit     uint64        `env:"CASINO_GAS_LIMIT"     default:"200000"`
    CommitBlocks uint64        `env:"CASINO_COMMIT_BLOCKS" default:"250"`
}
```

## 9. Redis Configuration

```conf
appendonly yes
appendfsync everysec
maxmemory 50mb
maxmemory-policy noeviction
```

## 10. Docker Compose

```yaml
services:
  dealer:
    build: .
    ports: ["8080:8080"]
    env_file: .env
    depends_on: [redis]
    restart: always
  redis:
    image: redis:7-alpine
    command: redis-server /usr/local/etc/redis/redis.conf
    volumes:
      - redis-data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    restart: always
volumes:
  redis-data:
```

## 11. Startup Sequence

```
1.  Load config
2.  Connect Redis (verify AOF)
3.  Connect RPC, verify chainId == 31337
4.  Query casino: croupier() == our address
5.  recoverOnStartup()  ← may block if in-flight tx pending
6.  Start BetPlaced poller (3s)
7.  Start history poller (3s)
8.  Start issued→expired cleanup (60s)
9.  Start settlement worker (strict serial, fully blocking)
10. Start HTTP server (:8080)
```

## 12. Goroutine 구성

```
main
  ├─ [goroutine] BetPlaced poller (3s)
  ├─ [goroutine] History poller (3s)
  ├─ [goroutine] issued→expired cleanup (60s)
  ├─ [goroutine] settlement worker (settleCh, strict serial)
  └─ [main] HTTP server (:8080)
```

4개 goroutine. Nonce는 settlement worker만 접근.
`settleCh := make(chan *BetEvent, 100)` — buffered. Recovery에서 worker 시작 전 enqueue 가능.

## 13. File Structure

```
dealer/
├── SPEC.md
├── main.go
├── config.go
├── api.go
├── signer.go
├── poller.go
├── settler.go
├── recovery.go
├── store.go
├── types.go
├── redis.conf
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

## 14. Error Hierarchy

| 수준 | 대응 | 예시 |
|------|------|------|
| **fatal** | 프로세스 종료 (os.Exit). restart:always로 재시작 → recovery가 재판정. 체인 복구 시 자연 해소. | Redis write 실패, 10min+ pending |
| **error** | bet abandon, worker 계속 | secret 없음, blockhash 불가 |
| **warn** | 자동 복구 | tx dropped, nonce resync, startup blocked |
| **info** | 정상 | placed, settled, confirmed |
