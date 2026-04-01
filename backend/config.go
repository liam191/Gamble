package main

import (
	"crypto/ecdsa"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

type Config struct {
	// Chain
	RPCURL  string
	ChainID int64

	// Contract
	CasinoAddr common.Address

	// Account
	PrivateKey *ecdsa.PrivateKey
	Address    common.Address

	// Redis
	RedisURL string

	// Server
	Port int

	// Tuning
	PollInterval time.Duration
	GasPrice     int64
	GasLimit     uint64
	CommitBlocks uint64
}

func LoadConfig() (*Config, error) {
	cfg := &Config{
		RPCURL:       envOrDefault("CASINO_RPC_URL", "https://rpc.defi.chainlight.com"),
		ChainID:      envInt64OrDefault("CASINO_CHAIN_ID", 31337),
		RedisURL:     envOrDefault("CASINO_REDIS_URL", "localhost:6379"),
		Port:         int(envInt64OrDefault("CASINO_PORT", 8080)),
		PollInterval: envDurationOrDefault("CASINO_POLL_INTERVAL", 3*time.Second),
		GasPrice:     envInt64OrDefault("CASINO_GAS_PRICE", 7),
		GasLimit:     uint64(envInt64OrDefault("CASINO_GAS_LIMIT", 200000)),
		CommitBlocks: uint64(envInt64OrDefault("CASINO_COMMIT_BLOCKS", 250)),
	}

	// Casino contract address
	casinoStr := os.Getenv("CASINO_CONTRACT")
	if casinoStr == "" {
		return nil, fmt.Errorf("CASINO_CONTRACT is required")
	}
	if !common.IsHexAddress(casinoStr) {
		return nil, fmt.Errorf("CASINO_CONTRACT is not a valid address: %s", casinoStr)
	}
	cfg.CasinoAddr = common.HexToAddress(casinoStr)

	// Private key
	pkStr := os.Getenv("CASINO_PRIVATE_KEY")
	if pkStr == "" {
		return nil, fmt.Errorf("CASINO_PRIVATE_KEY is required")
	}
	// Strip 0x prefix if present
	if len(pkStr) >= 2 && pkStr[:2] == "0x" {
		pkStr = pkStr[2:]
	}
	pk, err := crypto.HexToECDSA(pkStr)
	if err != nil {
		return nil, fmt.Errorf("invalid CASINO_PRIVATE_KEY: %w", err)
	}
	cfg.PrivateKey = pk
	cfg.Address = crypto.PubkeyToAddress(pk.PublicKey)

	return cfg, nil
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func envInt64OrDefault(key string, defaultVal int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
		}
	}
	return defaultVal
}

func envDurationOrDefault(key string, defaultVal time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultVal
}
