package main

import (
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Println("=== UPchain Casino Dealer Bot ===")

	// 1. Load config
	cfg, err := LoadConfig()
	if err != nil {
		log.Fatalf("Config error: %v", err)
	}
	log.Printf("Address: %s", cfg.Address.Hex())
	log.Printf("Casino:  %s", cfg.CasinoAddr.Hex())
	log.Printf("ChainID: %d", cfg.ChainID)

	// 2. Connect Redis
	store, err := NewStore(cfg.RedisURL)
	if err != nil {
		log.Fatalf("Redis error: %v", err)
	}
	log.Println("Redis connected")

	// 3. Connect RPC + verify chain
	rpc, err := NewRPCClient(cfg.RPCURL, cfg.ChainID)
	if err != nil {
		log.Fatalf("RPC error: %v", err)
	}
	log.Println("RPC connected")

	// 4. Verify croupier
	croupier, err := rpc.CallCroupier(cfg.CasinoAddr)
	if err != nil {
		log.Fatalf("Cannot read croupier(): %v", err)
	}
	if croupier != cfg.Address {
		log.Fatalf("Croupier mismatch: contract=%s, us=%s", croupier.Hex(), cfg.Address.Hex())
	}
	log.Printf("Croupier verified: %s", croupier.Hex())

	// 5. Settlement channel
	settleCh := make(chan *BetEvent, 100)

	// 6. Nonce (atomic — read by API, written by worker/recovery)
	var nonce atomic.Uint64

	// 7. Recovery
	RecoverOnStartup(cfg, store, rpc, settleCh, &nonce)

	// 8. Start goroutines
	go StartBetPlacedPoller(cfg, store, rpc, settleCh)
	log.Println("BetPlaced poller started")

	go StartHistoryPoller(cfg, store, rpc)
	log.Println("History poller started")

	go StartIssuedCleanup(cfg, store, rpc, settleCh)
	log.Println("Issued cleanup started")

	go StartSettlementWorker(cfg, store, rpc, settleCh, &nonce)
	log.Println("Settlement worker started")

	// 9. HTTP server
	api := NewAPI(cfg, store, rpc, settleCh, &nonce)
	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("HTTP server starting on %s", addr)
	if err := http.ListenAndServe(addr, api.Handler()); err != nil {
		log.Fatalf("HTTP server error: %v", err)
	}
}
