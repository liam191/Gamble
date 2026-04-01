package main

import (
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
)

// StartBetPlacedPoller polls for BetPlaced events and transitions issued → placed.
func StartBetPlacedPoller(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent) {
	lastScanned := store.GetLastScannedBlock()
	if lastScanned == 0 {
		block, err := rpc.BlockNumber()
		if err != nil {
			log.Fatalf("Failed to get initial block number: %v", err)
		}
		lastScanned = block
		mustWrite(store.SetLastScannedBlock(lastScanned))
	}

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for range ticker.C {
		currentBlock, err := rpc.BlockNumber()
		if err != nil {
			log.Printf("[POLLER] RPC error: %v", err)
			continue
		}
		if currentBlock <= lastScanned {
			continue
		}

		// Pagination: max 2000 blocks per query
		toBlock := currentBlock
		if toBlock-lastScanned > MaxLogRange {
			toBlock = lastScanned + MaxLogRange
		}

		logs, err := rpc.GetLogs(
			lastScanned+1, toBlock,
			[][]common.Hash{{BetPlacedTopic}},
			[]common.Address{cfg.CasinoAddr},
		)
		if err != nil {
			log.Printf("[POLLER] GetLogs error: %v", err)
			continue // cursor stays, retry next tick
		}

		allOk := true
		for _, lg := range logs {
			if len(lg.Topics) < 3 {
				continue
			}
			commitHash := lg.Topics[1].Hex()
			placeBlock := lg.BlockNumber

			// CAS: issued → placed (dedupe — skip if already transitioned)
			ok, err := store.CASTransition(commitHash, StatusIssued,
				"status", StatusPlaced,
				"placeBlock", fmt.Sprint(placeBlock))
			if err != nil {
				log.Fatalf("[POLLER] Redis CAS failed: %v", err)
			}
			if !ok {
				continue // already placed or different status
			}

			mustWrite(store.PersistCommit(commitHash))

			settleCh <- &BetEvent{
				Commit:     lg.Topics[1],
				PlaceBlock: placeBlock,
			}

			player := common.BytesToAddress(lg.Topics[2].Bytes())
			log.Printf("[POLLER] BetPlaced: commit=%s player=%s block=%d",
				truncHash(commitHash), player.Hex()[:14], placeBlock)
		}

		// Advance cursor on successful GetLogs (even if empty)
		if allOk {
			mustWrite(store.SetLastScannedBlock(toBlock))
			lastScanned = toBlock
		}
	}
}

// StartHistoryPoller polls for BetSettled and BetRefunded events → history storage.
func StartHistoryPoller(cfg *Config, store *Store, rpc *RPCClient) {
	// Restore cursor from Redis (survives restart)
	lastHistoryBlock := store.GetHistoryCursor()
	if lastHistoryBlock == 0 {
		block, err := rpc.BlockNumber()
		if err == nil {
			lastHistoryBlock = block
		}
	}

	ticker := time.NewTicker(cfg.PollInterval)
	defer ticker.Stop()

	for range ticker.C {
		currentBlock, err := rpc.BlockNumber()
		if err != nil {
			continue
		}
		if currentBlock <= lastHistoryBlock {
			continue
		}

		// Pagination: max 2000 blocks per query
		toBlock := currentBlock
		if toBlock-lastHistoryBlock > MaxLogRange {
			toBlock = lastHistoryBlock + MaxLogRange
		}

		// BetSettled + BetRefunded in one range query
		settledLogs, err := rpc.GetLogs(
			lastHistoryBlock+1, toBlock,
			[][]common.Hash{{BetSettledTopic, BetRefundedTopic}},
			[]common.Address{cfg.CasinoAddr},
		)
		if err != nil {
			log.Printf("[HISTORY] GetLogs error: %v", err)
			continue
		}

		allSaved := true
		for _, lg := range settledLogs {
			if len(lg.Topics) < 3 {
				continue
			}
			commitHash := lg.Topics[1].Hex()
			player := common.BytesToAddress(lg.Topics[2].Bytes())

			// Non-fatal read: history is not critical path
			token, _ := store.GetCommitField(commitHash, "token")
			amount, _ := store.GetCommitField(commitHash, "amount")
			modulo, _ := store.GetCommitField(commitHash, "modulo")
			betMask, _ := store.GetCommitField(commitHash, "betMask")
			gameType, _ := store.GetCommitField(commitHash, "gameType")

			var entry HistoryEntry
			if lg.Topics[0] == BetSettledTopic && len(lg.Data) >= 64 {
				diceResult := new(big.Int).SetBytes(lg.Data[0:32]).Uint64()
				payoutUP := new(big.Int).SetBytes(lg.Data[32:64])
				entry = HistoryEntry{
					Commit:     commitHash,
					Player:     player.Hex(),
					Token:      token,
					Amount:     amount,
					Modulo:     modulo,
					BetMask:    betMask,
					GameType:   gameType,
					EventType:  "settled",
					DiceResult: diceResult,
					Won:        payoutUP.Sign() > 0,
					PayoutUP:   payoutUP.String(),
					Block:      lg.BlockNumber,
					TxHash:     lg.TxHash.Hex(),
				}
			} else if lg.Topics[0] == BetRefundedTopic && len(lg.Data) >= 64 {
				entry = HistoryEntry{
					Commit:     commitHash,
					Player:     player.Hex(),
					Token:      token,
					Amount:     amount,
					Modulo:     modulo,
					BetMask:    betMask,
					GameType:   gameType,
					EventType:  "refunded",
					DiceResult: 0,
					Won:        false,
					PayoutUP:   "0",
					Block:      lg.BlockNumber,
					TxHash:     lg.TxHash.Hex(),
				}
			} else {
				continue
			}

			log.Printf("[HISTORY] %s: player=%s game=%s token=%s amount=%s result=%d won=%v payout=%s tx=%s",
				entry.EventType, entry.Player, entry.GameType, entry.Token, entry.Amount,
				entry.DiceResult, entry.Won, entry.PayoutUP, truncHash(entry.TxHash))

			if err := store.SaveHistory(commitHash, entry); err != nil {
				log.Printf("[HISTORY] SaveHistory failed, stopping cursor: %s err=%v", truncHash(commitHash), err)
				allSaved = false
				break // don't advance cursor past failed write
			}
		}

		// Only advance cursor if all history entries were saved
		if allSaved {
			lastHistoryBlock = toBlock
			if err := store.SetHistoryCursor(toBlock); err != nil {
				log.Printf("[HISTORY] SetHistoryCursor failed: %v", err)
			}
		}
	}
}
