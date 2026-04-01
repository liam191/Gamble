package main

import (
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// ── Addresses ──

var (
	ZeroAddress = common.Address{}
	ETHSentinel = common.Address{} // address(0) = native ETH

	AddrWETH = common.HexToAddress("0xb416eACb2d3A0fCF53CC01cab2F387bf77dA03a5")
	AddrUP   = common.HexToAddress("0x65B7Bf774A173130a66967f5013c7652BACf022B")
	AddrSIDE = common.HexToAddress("0x5D5179b9FE335Dc1cA696914f356fB670B13712D")
	AddrSEC  = common.HexToAddress("0x2b020a10e2737C4aDd1ca3a503f67c705e15E540")
	AddrUSP  = common.HexToAddress("0x8da87c3B6d989593Afe5E1Cb4E57e50B3c8b38cd")
)

var SupportedTokens = map[common.Address]bool{
	ETHSentinel: true,
	AddrWETH:    true,
	AddrUP:      true,
	AddrSIDE:    true,
	AddrSEC:     true,
	AddrUSP:     true,
}

// ── Constants ──

const (
	BetExpirationBlocks = 250
	CommitBlocks        = 250
	MaxModulo           = 100
	MinModulo           = 2
	MaxRetries          = 3
	MaxLogRange         = 2000 // max blocks per eth_getLogs query
)

// ── BetEvent: poller → settler channel ──

type BetEvent struct {
	Commit     common.Hash
	PlaceBlock uint64
}

// ── API types ──

type CommitRequest struct {
	Player   string `json:"player"`
	Token    string `json:"token"`
	Amount   string `json:"amount"`
	BetMask  string `json:"betMask"`
	Modulo   string `json:"modulo"`
	GameType string `json:"gameType"` // "coin","dice","doubledice","dragon","baccarat","roulette","hilo"
}

type CommitResponse struct {
	Commit          string `json:"commit"`
	CommitLastBlock uint64 `json:"commitLastBlock"`
	V               uint8  `json:"v"`
	R               string `json:"r"`
	S               string `json:"s"`
}

type StatusResponse struct {
	Status      string `json:"status"`
	Block       uint64 `json:"block"`
	PendingBets int    `json:"pendingBets"`
	QueueLength int    `json:"queueLength"`
	Nonce       uint64 `json:"nonce"`
	Uptime      string `json:"uptime"`
}

type HistoryEntry struct {
	Commit     string `json:"commit"`
	Player     string `json:"player"`
	Token      string `json:"token"`
	Amount     string `json:"amount"`
	Modulo     string `json:"modulo"`
	BetMask    string `json:"betMask"`
	GameType   string `json:"gameType"` // "coin", "dice", "doubledice", "dragon", "baccarat", "roulette", "hilo"
	EventType  string `json:"eventType"` // "settled" or "refunded"
	DiceResult uint64 `json:"diceResult"`
	Won        bool   `json:"won"`
	PayoutUP   string `json:"payoutUP"`
	Block      uint64 `json:"block"`
	TxHash     string `json:"txHash"`
}

type HistoryResponse struct {
	Bets []HistoryEntry `json:"bets"`
}

// ── Commit status ──

const (
	StatusIssued    = "issued"
	StatusPlaced    = "placed"
	StatusSent      = "sent"
	StatusConfirmed = "confirmed"
	StatusFailed    = "failed"
	StatusAbandoned = "abandoned"
	StatusExpired   = "expired"
)

// ── ABI event topic hashes ──

var (
	BetPlacedTopic   common.Hash
	BetSettledTopic  common.Hash
	BetRefundedTopic common.Hash
	SettleBetSelector [4]byte
	BetsSelector      [4]byte
)

func init() {
	BetPlacedTopic = eventTopic("BetPlaced(uint256,address,address,uint256,uint8,uint8,uint256)")
	BetSettledTopic = eventTopic("BetSettled(uint256,address,uint256,uint256)")
	BetRefundedTopic = eventTopic("BetRefunded(uint256,address,address,uint256,bool)")

	copy(SettleBetSelector[:], crypto.Keccak256([]byte("settleBet(uint256,bytes32)"))[:4])
	copy(BetsSelector[:], crypto.Keccak256([]byte("bets(uint256)"))[:4])
}

func eventTopic(sig string) common.Hash {
	return common.BytesToHash(crypto.Keccak256([]byte(sig)))
}
