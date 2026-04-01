package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"sync/atomic"
	"strconv"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
)

// ── IP rate limiter (10 req/min) ──

type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (rl *rateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)
	valid := rl.requests[ip][:0]
	for _, t := range rl.requests[ip] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= rl.limit {
		rl.requests[ip] = valid
		return false
	}
	rl.requests[ip] = append(valid, now)
	return true
}

type API struct {
	cfg      *Config
	store    *Store
	rpc      *RPCClient
	settleCh chan *BetEvent
	startAt  time.Time
	nonce    *atomic.Uint64
	limiter  *rateLimiter
}

func NewAPI(cfg *Config, store *Store, rpc *RPCClient, settleCh chan *BetEvent, nonce *atomic.Uint64) *API {
	return &API{
		cfg:      cfg,
		store:    store,
		rpc:      rpc,
		settleCh: settleCh,
		startAt:  time.Now(),
		nonce:    nonce,
		limiter:  newRateLimiter(10, time.Minute), // 10 req/min per IP
	}
}

func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/commit", a.handleCommit)
	mux.HandleFunc("GET /api/status", a.handleStatus)
	mux.HandleFunc("GET /api/history", a.handleHistory)
	return corsMiddleware(mux)
}

// ── POST /api/commit ──

func (a *API) handleCommit(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")

	// Rate limit — extract IP without port, ignore spoofable headers
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	if ip == "" {
		ip = r.RemoteAddr
	}
	if !a.limiter.Allow(ip) {
		jsonError(w, "rate limit exceeded (10 req/min)", http.StatusTooManyRequests)
		return
	}

	var req CommitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate player
	if !common.IsHexAddress(req.Player) {
		jsonError(w, "invalid player address", http.StatusBadRequest)
		return
	}
	player := common.HexToAddress(req.Player)

	// Validate token
	if !common.IsHexAddress(req.Token) {
		jsonError(w, "invalid token address", http.StatusBadRequest)
		return
	}
	token := common.HexToAddress(req.Token)
	if !SupportedTokens[token] {
		jsonError(w, "unsupported token", http.StatusBadRequest)
		return
	}

	// Validate amount
	amount, ok := new(big.Int).SetString(req.Amount, 10)
	if !ok || amount.Sign() <= 0 {
		jsonError(w, "invalid amount", http.StatusBadRequest)
		return
	}

	// Validate betMask
	betMask, ok := new(big.Int).SetString(req.BetMask, 10)
	if !ok || betMask.Sign() <= 0 {
		jsonError(w, "invalid betMask", http.StatusBadRequest)
		return
	}

	// Validate modulo
	modulo, err := strconv.ParseUint(req.Modulo, 10, 64)
	if err != nil || modulo < MinModulo || modulo > MaxModulo {
		jsonError(w, fmt.Sprintf("modulo must be %d-%d", MinModulo, MaxModulo), http.StatusBadRequest)
		return
	}

	// Validate gameType + modulo consistency
	gameTypeModulo := map[string]uint64{
		"coin": 2, "dice": 6, "doubledice": 36,
		"dragon": 13, "baccarat": 13,
		"roulette": 37, "hilo": 100,
	}
	expectedModulo, validGame := gameTypeModulo[req.GameType]
	if !validGame {
		jsonError(w, "invalid gameType", http.StatusBadRequest)
		return
	}
	if expectedModulo != modulo {
		jsonError(w, fmt.Sprintf("gameType %s requires modulo %d", req.GameType, expectedModulo), http.StatusBadRequest)
		return
	}

	// Get current block
	currentBlock, err := a.rpc.BlockNumber()
	if err != nil {
		log.Printf("[API] RPC error: %v", err)
		jsonError(w, "RPC error", http.StatusServiceUnavailable)
		return
	}

	// Generate secret + commit
	secret, err := GenerateSecret()
	if err != nil {
		log.Printf("[API] Secret generation error: %v", err)
		jsonError(w, "internal error", http.StatusInternalServerError)
		return
	}
	commit := CommitFromSecret(secret)
	commitLastBlock := currentBlock + a.cfg.CommitBlocks

	// Sign
	v, rSig, sSig, err := SignCommit(
		a.cfg.PrivateKey,
		a.cfg.CasinoAddr,
		big.NewInt(a.cfg.ChainID),
		new(big.Int).SetUint64(commitLastBlock),
		commit.Big(),
		player,
		token,
		amount,
		betMask,
		new(big.Int).SetUint64(modulo),
	)
	if err != nil {
		log.Printf("[API] Signing error: %v", err)
		jsonError(w, "signing error", http.StatusInternalServerError)
		return
	}

	// Store in Redis
	fields := map[string]interface{}{
		"secret":          common.Bytes2Hex(secret[:]),
		"status":          StatusIssued,
		"player":          player.Hex(),
		"token":           token.Hex(),
		"amount":          amount.String(),
		"betMask":         betMask.String(),
		"modulo":          strconv.FormatUint(modulo, 10),
		"gameType":        req.GameType,
		"commitLastBlock": strconv.FormatUint(commitLastBlock, 10),
		"issuedAt":        strconv.FormatInt(time.Now().Unix(), 10),
		"retryCount":      "0",
	}
	if err := a.store.SaveCommit(commit.Hex(), fields); err != nil {
		log.Printf("[API] Redis save error: %v", err)
		jsonError(w, "storage error", http.StatusInternalServerError)
		return
	}

	log.Printf("[API] Commit issued: %s player=%s token=%s amount=%s modulo=%d",
		commit.Hex()[:14], player.Hex()[:14], token.Hex()[:14], amount.String(), modulo)

	// Response
	resp := CommitResponse{
		Commit:          commit.Hex(),
		CommitLastBlock: commitLastBlock,
		V:               v,
		R:               fmt.Sprintf("0x%064x", rSig),
		S:               fmt.Sprintf("0x%064x", sSig),
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

// ── GET /api/status ──

func (a *API) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	block, _ := a.rpc.BlockNumber()

	resp := StatusResponse{
		Status:      "ok",
		Block:       block,
		PendingBets: a.store.CountActiveStatuses(),
		QueueLength: len(a.settleCh),
		Nonce:       a.nonce.Load(),
		Uptime:      time.Since(a.startAt).Truncate(time.Second).String(),
	}
	json.NewEncoder(w).Encode(resp)
}

// ── GET /api/history ──

func (a *API) handleHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	entries, err := a.store.GetRecentHistory(50)
	if err != nil {
		jsonError(w, "storage error", http.StatusInternalServerError)
		return
	}

	resp := HistoryResponse{Bets: entries}
	if resp.Bets == nil {
		resp.Bets = []HistoryEntry{}
	}
	json.NewEncoder(w).Encode(resp)
}

// ── CORS middleware ──

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── JSON error helper ──

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
