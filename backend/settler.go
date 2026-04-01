package main

import (
	"encoding/hex"
	"errors"
	"log"
	"math/big"
	"sync/atomic"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// StartSettlementWorker is the single goroutine that processes bets from settleCh.
// Strict serial: blocks until each tx is fully resolved before sending the next.
func StartSettlementWorker(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent, nonce *atomic.Uint64) {
	for bet := range settleCh {
		processSettlement(cfg, store, rpc, settleCh, bet, nonce)
	}
}

func processSettlement(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent, bet *BetEvent, nonce *atomic.Uint64) {
	commitHash := bet.Commit.Hex()

	// 1. Dedupe
	status := store.MustGetField(commitHash, "status")
	if status != StatusPlaced && status != StatusFailed {
		return
	}

	// 2. Secret
	secretHex := store.MustGetField(commitHash, "secret")
	if secretHex == "" {
		mustWrite(store.SetCommitFields(commitHash, map[string]interface{}{"status": StatusAbandoned}))
		mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
		log.Printf("[SETTLER] Secret missing, abandoned: %s", truncHash(commitHash))
		return
	}
	var secret [32]byte
	secretBytes, err := hex.DecodeString(secretHex)
	if err != nil || len(secretBytes) != 32 {
		mustWrite(store.SetCommitFields(commitHash, map[string]interface{}{"status": StatusAbandoned}))
		mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
		log.Printf("[SETTLER] Invalid secret, abandoned: %s", truncHash(commitHash))
		return
	}
	copy(secret[:], secretBytes)

	// 3. Wait for N+1 block
	for {
		currentBlock, err := rpc.BlockNumber()
		if err != nil {
			log.Printf("[SETTLER] RPC error waiting for N+1: %v", err)
			time.Sleep(500 * time.Millisecond)
			continue
		}
		if currentBlock > bet.PlaceBlock {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	// 4. Blockhash
	blockHash, err := rpc.GetBlockHash(bet.PlaceBlock)
	if err != nil || blockHash == (common.Hash{}) {
		mustWrite(store.SetCommitFields(commitHash, map[string]interface{}{"status": StatusAbandoned}))
		mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
		log.Printf("[SETTLER] Blockhash unavailable, abandoned (user can refundBet): %s", truncHash(commitHash))
		return
	}

	// 5. Build + send TX
	calldata := BuildSettleBetCalldata(secret, blockHash)
	gasPrice := big.NewInt(cfg.GasPrice)
	rawTx, _, err := SignTransaction(
		cfg.PrivateKey, nonce.Load(), cfg.CasinoAddr,
		big.NewInt(0), cfg.GasLimit, gasPrice,
		calldata, big.NewInt(cfg.ChainID),
	)
	if err != nil {
		log.Printf("[SETTLER] TX build error: %v, resyncing + requeue", err)
		resyncNonce(rpc, cfg, nonce)
		if !requeueWithRetry(store, settleCh, commitHash, bet) {
			return
		}
		time.Sleep(3 * time.Second)
		return
	}

	txHash, err := rpc.SendRawTx(rawTx)
	if err != nil {
		log.Printf("[SETTLER] SendRawTx error: %v, resyncing + requeue", err)
		resyncNonce(rpc, cfg, nonce)
		if !requeueWithRetry(store, settleCh, commitHash, bet) {
			return
		}
		time.Sleep(3 * time.Second)
		return
	}

	// 6. placed → sent
	mustWrite(store.SetCommitFields(commitHash, map[string]interface{}{
		"status": StatusSent,
		"txHash": txHash.Hex(),
	}))

	log.Printf("[SETTLER] TX sent: %s commit=%s nonce=%d", txHash.Hex()[:14], truncHash(commitHash), nonce.Load())

	// 7. Resolve — blocks until confirmed/reverted/dropped
	result := resolveTransaction(rpc, cfg, txHash, calldata, nonce.Load())

	// 8. Apply result (with re-enqueue for reverted/dropped)
	applyResult(store, settleCh, commitHash, result, bet, nonce)
}

// resolveTransaction blocks until the tx reaches a final state.
func resolveTransaction(rpc *RPCClient, cfg *Config, txHash common.Hash, calldata []byte, txNonce uint64) string {
	// Phase 1: check first, sleep after (saves ~1.5s avg per settlement)
	for i := 0; i < 10; i++ {
		receipt, err := rpc.GetTransactionReceipt(txHash)
		if err == nil && receipt != nil {
			if receipt.Status == 1 {
				return "confirmed"
			}
			return "reverted"
		}
		time.Sleep(3 * time.Second)
	}

	// Phase 2: extended wait with existence check (up to 5 min)
	deadline := time.Now().Add(5 * time.Minute)
	for time.Now().Before(deadline) {
		receipt, err := rpc.GetTransactionReceipt(txHash)
		if err == nil && receipt != nil {
			if receipt.Status == 1 {
				return "confirmed"
			}
			return "reverted"
		}

		// [Fix #4] Distinguish "not found" from RPC error
		exists, rpcErr := txExists(rpc, txHash)
		if rpcErr != nil {
			// RPC error — don't assume dropped, just retry
			log.Printf("[SETTLER] RPC error checking tx existence: %v", rpcErr)
			time.Sleep(5 * time.Second)
			continue
		}
		if !exists {
			return "dropped"
		}

		log.Printf("[SETTLER] TX still pending: %s", txHash.Hex()[:14])
		time.Sleep(5 * time.Second)
	}

	// Phase 3: stuck 5min — send replacement with same calldata + higher gas
	log.Printf("[SETTLER] TX stuck 5min, sending replacement: %s", txHash.Hex()[:14])
	return sendReplacement(rpc, cfg, txHash, calldata, txNonce)
}

// [Fix #4] txExists: returns (exists, error). Only returns false when NotFound.
func txExists(rpc *RPCClient, txHash common.Hash) (bool, error) {
	_, _, err := rpc.GetTransactionByHash(txHash)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, ethereum.NotFound) {
		return false, nil
	}
	return false, err // RPC error — caller should not treat as "not found"
}

func sendReplacement(rpc *RPCClient, cfg *Config, stuckHash common.Hash, calldata []byte, txNonce uint64) string {
	gasPrice := big.NewInt(cfg.GasPrice * 2)
	rawTx, _, err := SignTransaction(
		cfg.PrivateKey, txNonce, cfg.CasinoAddr,
		big.NewInt(0), cfg.GasLimit, gasPrice,
		calldata, big.NewInt(cfg.ChainID),
	)
	if err != nil {
		log.Printf("[SETTLER] Replacement build error: %v", err)
		return recheckInFlight(rpc, stuckHash, common.Hash{})
	}

	replaceHash, err := rpc.SendRawTx(rawTx)
	if err != nil {
		log.Printf("[SETTLER] Replacement send error: %v", err)
		return recheckInFlight(rpc, stuckHash, common.Hash{})
	}

	log.Printf("[SETTLER] Replacement sent: %s (original: %s)", replaceHash.Hex()[:14], stuckHash.Hex()[:14])

	// Wait for either to confirm
	for i := 0; i < 20; i++ {
		time.Sleep(3 * time.Second)

		origReceipt, err := rpc.GetTransactionReceipt(stuckHash)
		if err == nil && origReceipt != nil {
			if origReceipt.Status == 1 {
				return "confirmed"
			}
			return "reverted"
		}

		replaceReceipt, err := rpc.GetTransactionReceipt(replaceHash)
		if err == nil && replaceReceipt != nil {
			if replaceReceipt.Status == 1 {
				return "confirmed"
			}
			return "reverted"
		}
	}

	return recheckInFlight(rpc, stuckHash, replaceHash)
}

func recheckInFlight(rpc *RPCClient, origHash, replaceHash common.Hash) string {
	log.Printf("[SETTLER] Rechecking in-flight txs")

	for i := 0; i < 20; i++ {
		time.Sleep(15 * time.Second)

		origReceipt, err := rpc.GetTransactionReceipt(origHash)
		if err == nil && origReceipt != nil {
			if origReceipt.Status == 1 {
				return "confirmed"
			}
			return "reverted"
		}

		if replaceHash != (common.Hash{}) {
			replaceReceipt, err := rpc.GetTransactionReceipt(replaceHash)
			if err == nil && replaceReceipt != nil {
				if replaceReceipt.Status == 1 {
					return "confirmed"
				}
				return "reverted"
			}
		}

		// Check existence — RPC error = assume still alive (don't drop)
		origAlive, origErr := txExists(rpc, origHash)
		replaceAlive := false
		var replaceErr error
		if replaceHash != (common.Hash{}) {
			replaceAlive, replaceErr = txExists(rpc, replaceHash)
		}

		// If any RPC error, assume tx still exists (conservative)
		if origErr != nil || replaceErr != nil {
			log.Printf("[SETTLER] RPC error checking in-flight, assuming alive (origErr=%v replaceErr=%v)", origErr, replaceErr)
			continue
		}

		if origAlive || replaceAlive {
			log.Printf("[SETTLER] In-flight still pending (orig=%v replace=%v)", origAlive, replaceAlive)
			continue
		}

		return "dropped"
	}

	log.Fatalf("MANUAL INTERVENTION: in-flight tx pending over 10min, status=sent preserved")
	return ""
}

// applyResult: worker-only. Handles nonce progression + re-enqueue.
func applyResult(store *Store, settleCh chan *BetEvent, commitHash, result string, bet *BetEvent, nonce *atomic.Uint64) {
	switch result {
	case "confirmed":
		mustWrite(store.AtomicConfirm(commitHash))
		nonce.Add(1)
		log.Printf("[SETTLER] Confirmed: %s", truncHash(commitHash))

	case "reverted":
		nonce.Add(1)
		retryCount := mustWriteInt(store.IncrRetryCount(commitHash))
		if retryCount >= MaxRetries {
			mustWrite(store.SetCommitStatus(commitHash, StatusAbandoned))
			mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
			log.Printf("[SETTLER] Abandoned after %d retries: %s", retryCount, truncHash(commitHash))
		} else {
			mustWrite(store.SetCommitStatus(commitHash, StatusFailed))
			settleCh <- bet // [Fix #1] re-enqueue for retry
			log.Printf("[SETTLER] Reverted, requeued (retry %d/%d): %s", retryCount, MaxRetries, truncHash(commitHash))
		}

	case "dropped":
		// Nonce not consumed — same nonce reused
		mustWrite(store.SetCommitStatus(commitHash, StatusPlaced))
		settleCh <- bet // [Fix #1] re-enqueue
		log.Printf("[SETTLER] Dropped, requeued: %s", truncHash(commitHash))
	}
}

// applyRecoveryResult: recovery-only. No nonce change, no re-enqueue (recovery handles separately).
func applyRecoveryResult(store *Store, commitHash, result string, bet *BetEvent, settleCh chan *BetEvent) {
	switch result {
	case "confirmed":
		mustWrite(store.AtomicConfirm(commitHash))
		log.Printf("[RECOVERY] Confirmed: %s", truncHash(commitHash))

	case "reverted":
		retryCount := mustWriteInt(store.IncrRetryCount(commitHash))
		if retryCount >= MaxRetries {
			mustWrite(store.SetCommitStatus(commitHash, StatusAbandoned))
			mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
			log.Printf("[RECOVERY] Abandoned: %s", truncHash(commitHash))
		} else {
			mustWrite(store.SetCommitStatus(commitHash, StatusFailed))
			if bet != nil {
				settleCh <- bet
			}
			log.Printf("[RECOVERY] Reverted, requeued: %s", truncHash(commitHash))
		}

	case "dropped":
		mustWrite(store.SetCommitStatus(commitHash, StatusPlaced))
		if bet != nil {
			settleCh <- bet
		}
		log.Printf("[RECOVERY] Dropped, requeued: %s", truncHash(commitHash))
	}
}

// getTxWithNonce: fetch tx and its nonce atomically. Returns (nil, 0, nil) if NotFound.
func getTxWithNonce(rpc *RPCClient, txHash common.Hash) (*types.Transaction, uint64, error) {
	tx, _, err := rpc.GetTransactionByHash(txHash)
	if err != nil {
		if errors.Is(err, ethereum.NotFound) {
			return nil, 0, nil // genuinely not found
		}
		return nil, 0, err // RPC error
	}
	return tx, tx.Nonce(), nil
}

// requeueWithRetry: re-enqueue with retryCount check. Returns false if abandoned.
func requeueWithRetry(store *Store, settleCh chan *BetEvent, commitHash string, bet *BetEvent) bool {
	retryCount := mustWriteInt(store.IncrRetryCount(commitHash))
	if retryCount >= MaxRetries {
		mustWrite(store.SetCommitStatus(commitHash, StatusAbandoned))
		mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
		log.Printf("[SETTLER] Send error abandoned after %d retries: %s", retryCount, truncHash(commitHash))
		return false
	}
	settleCh <- bet
	log.Printf("[SETTLER] Send error, requeued (retry %d/%d): %s", retryCount, MaxRetries, truncHash(commitHash))
	return true
}

func resyncNonce(rpc *RPCClient, cfg *Config, nonce *atomic.Uint64) {
	n, err := rpc.GetNonce(cfg.Address)
	if err != nil {
		log.Printf("[SETTLER] Nonce resync failed: %v", err)
		return
	}
	nonce.Store(n)
	log.Printf("[SETTLER] Nonce resynced: %d", n)
}
