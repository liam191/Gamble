package main

import (
	"encoding/hex"
	"fmt"
	"log"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/ethereum/go-ethereum/common"
)

// RecoverOnStartup resolves in-flight bets and rescans recent events.
// May block if pending sent txs exist (up to 10min per tx).
func RecoverOnStartup(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent, nonce *atomic.Uint64) {
	currentBlock, err := rpc.BlockNumber()
	if err != nil {
		log.Fatalf("Recovery: cannot get block number: %v", err)
	}

	handled := make(map[string]bool)

	// ── Step 1: Resolve status=sent (most dangerous on crash) ──
	sentCommits, err := store.ScanByStatus(StatusSent)
	if err != nil {
		log.Fatalf("Recovery: Redis scan failed: %v", err)
	}

	for _, commitHash := range sentCommits {
		log.Printf("[RECOVERY] Resolving sent commit (may block): %s", truncHash(commitHash))

		txHashHex := store.MustGetField(commitHash, "txHash")
		if txHashHex == "" {
			mustWrite(store.SetCommitStatus(commitHash, StatusAbandoned))
			mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
			handled[commitHash] = true
			continue
		}
		txHash := common.HexToHash(txHashHex)

		// Check receipt first
		receipt, err := rpc.GetTransactionReceipt(txHash)
		if err == nil && receipt != nil {
			if receipt.Status == 1 {
				applyRecoveryResult(store, commitHash, "confirmed", nil, settleCh)
				log.Printf("[RECOVERY] sent→confirmed: %s", truncHash(commitHash))
			} else {
				bet := recoverBetEvent(store, commitHash)
				applyRecoveryResult(store, commitHash, "reverted", bet, settleCh)
				log.Printf("[RECOVERY] sent→reverted: %s", truncHash(commitHash))
			}
			handled[commitHash] = true
			continue
		}

		// No receipt — get tx with nonce in one call
		tx, txNonce, txErr := getTxWithNonce(rpc, txHash)
		if txErr != nil {
			// RPC error — keep sent, DON'T mark handled → next restart retries
			log.Printf("[RECOVERY] RPC error checking tx, keeping sent (will retry on restart): %s err=%v", truncHash(commitHash), txErr)
			continue
		}

		if tx != nil {
			// TX still pending — resolve (may block up to 10min)
			log.Printf("[RECOVERY] sent tx still pending (nonce=%d), blocking: %s", txNonce, truncHash(commitHash))

			secretHex := store.MustGetField(commitHash, "secret")
			placeBlockStr := store.MustGetField(commitHash, "placeBlock")
			placeBlock, _ := strconv.ParseUint(placeBlockStr, 10, 64)

			var calldata []byte
			if secretHex != "" && placeBlock > 0 {
				var secret [32]byte
				secretBytes, _ := hex.DecodeString(secretHex)
				if len(secretBytes) == 32 {
					copy(secret[:], secretBytes)
					// [Fix #3] Verify blockhash is valid before building calldata
					blockHash, bhErr := rpc.GetBlockHash(placeBlock)
					if bhErr == nil && blockHash != (common.Hash{}) {
						calldata = BuildSettleBetCalldata(secret, blockHash)
					}
				}
			}

			if calldata != nil {
				result := resolveTransaction(rpc, cfg, txHash, calldata, txNonce)
				bet := recoverBetEvent(store, commitHash)
				applyRecoveryResult(store, commitHash, result, bet, settleCh)
			} else {
				// Can't rebuild calldata — keep sent, manual intervention
				log.Printf("[RECOVERY] Cannot rebuild calldata (blockhash/secret issue), keeping sent: %s", truncHash(commitHash))
			}
			handled[commitHash] = true
		} else {
			// TX genuinely not found (dropped)
			mustWrite(store.SetCommitStatus(commitHash, StatusPlaced))
			bet := recoverBetEvent(store, commitHash)
			if bet != nil {
				settleCh <- bet
			}
			handled[commitHash] = true
			log.Printf("[RECOVERY] sent→placed (dropped): %s", truncHash(commitHash))
		}
	}

	// ── Step 2: Rescan recent BetPlaced events ──
	fromBlock := uint64(0)
	if currentBlock > BetExpirationBlocks {
		fromBlock = currentBlock - BetExpirationBlocks
	}

	logs, err := rpc.GetLogs(
		fromBlock, currentBlock,
		[][]common.Hash{{BetPlacedTopic}},
		[]common.Address{cfg.CasinoAddr},
	)
	if err != nil {
		log.Printf("[RECOVERY] GetLogs error (non-fatal): %v", err)
	} else {
		for _, lg := range logs {
			if len(lg.Topics) < 2 {
				continue
			}
			commitHash := lg.Topics[1].Hex()

			// Skip if already handled in step 1
			if handled[commitHash] {
				continue
			}

			// On-chain: still active?
			active, err := rpc.IsBetActive(cfg.CasinoAddr, lg.Topics[1])
			if err != nil {
				log.Printf("[RECOVERY] RPC error checking bet, skipping: %s err=%v", truncHash(commitHash), err)
				continue // don't assume inactive on RPC error
			}
			if !active {
				continue // genuinely settled or refunded
			}

			status := store.MustGetField(commitHash, "status")
			secret := store.MustGetField(commitHash, "secret")

			switch {
			case secret != "" && (status == StatusPlaced || status == StatusFailed || status == ""):
				mustWrite(store.SetCommitFields(commitHash, map[string]interface{}{
					"status":     StatusPlaced,
					"placeBlock": fmt.Sprint(lg.BlockNumber),
				}))
				mustWrite(store.PersistCommit(commitHash))
				settleCh <- &BetEvent{
					Commit:     lg.Topics[1],
					PlaceBlock: lg.BlockNumber,
				}
				log.Printf("[RECOVERY] Requeued: %s block=%d", truncHash(commitHash), lg.BlockNumber)

			case secret == "" && status != StatusConfirmed:
				mustWrite(store.SetCommitStatus(commitHash, StatusAbandoned))
				mustWrite(store.ExpireCommit(commitHash, 7*24*time.Hour))
				log.Printf("[RECOVERY] No secret, abandoned: %s", truncHash(commitHash))
			}
		}
	}

	// ── Step 3: Final nonce sync ──
	n, err := rpc.GetNonce(cfg.Address)
	if err != nil {
		log.Fatalf("Recovery: nonce sync failed: %v", err)
	}
	nonce.Store(n)
	log.Printf("[RECOVERY] Complete. nonce=%d", n)
}

// StartIssuedCleanup periodically expires stale issued commits.
func StartIssuedCleanup(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		currentBlock, err := rpc.BlockNumber()
		if err != nil {
			continue
		}

		issued, err := store.ScanByStatus(StatusIssued)
		if err != nil {
			log.Printf("[CLEANUP] Scan error: %v", err)
			continue
		}

		for _, commitHash := range issued {
			clbStr := store.MustGetField(commitHash, "commitLastBlock")
			clb, _ := strconv.ParseUint(clbStr, 10, 64)
			if clb == 0 {
				continue
			}

			// Grace: +10 blocks
			if currentBlock <= clb+10 {
				continue
			}

			// On-chain check: maybe poller missed the BetPlaced
			commit := common.HexToHash(commitHash)

			active, err := rpc.IsBetActive(cfg.CasinoAddr, commit)
			if err != nil {
				log.Printf("[CLEANUP] RPC error checking bet, skipping: %s err=%v", truncHash(commitHash), err)
				continue // don't expire on RPC error
			}
			if active {
				// Bet exists on-chain! Recover: issued → placed
				// Find placeBlock from logs
				fromBlock := uint64(0)
				if clb > BetExpirationBlocks {
					fromBlock = clb - BetExpirationBlocks
				}
				logs, err := rpc.GetLogs(
					fromBlock, currentBlock,
					[][]common.Hash{{BetPlacedTopic}, {commit}},
					[]common.Address{cfg.CasinoAddr},
				)
				if err != nil || len(logs) == 0 {
					continue
				}
				placeBlock := logs[0].BlockNumber

				ok, err := store.CASTransition(commitHash, StatusIssued,
					"status", StatusPlaced,
					"placeBlock", fmt.Sprint(placeBlock))
				if err != nil {
					log.Fatalf("[CLEANUP] Redis CAS failed: %v", err)
				}
				if ok {
					mustWrite(store.PersistCommit(commitHash))
					settleCh <- &BetEvent{Commit: commit, PlaceBlock: placeBlock}
					log.Printf("[CLEANUP] issued→placed (recovered): %s", truncHash(commitHash))
				}
			} else {
				// No bet on-chain — expire
				ok, err := store.CASTransition(commitHash, StatusIssued, "status", StatusExpired)
				if err != nil {
					log.Fatalf("[CLEANUP] Redis CAS failed: %v", err)
				}
				if ok {
					mustWrite(store.ExpireCommit(commitHash, 24*time.Hour))
					log.Printf("[CLEANUP] issued→expired: %s", truncHash(commitHash))
				}
			}
		}
	}
}

// recoverBetEvent rebuilds a BetEvent from Redis fields.
func recoverBetEvent(store *Store, commitHash string) *BetEvent {
	placeBlockStr := store.MustGetField(commitHash, "placeBlock")
	placeBlock, _ := strconv.ParseUint(placeBlockStr, 10, 64)
	if placeBlock == 0 {
		return nil
	}
	return &BetEvent{
		Commit:     common.HexToHash(commitHash),
		PlaceBlock: placeBlock,
	}
}
