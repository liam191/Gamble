package main

import (
	"crypto/ecdsa"
	"crypto/rand"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/math"
	"github.com/ethereum/go-ethereum/crypto"
)

// GenerateSecret creates a cryptographically random 32-byte secret.
func GenerateSecret() ([32]byte, error) {
	var secret [32]byte
	_, err := rand.Read(secret[:])
	return secret, err
}

// CommitFromSecret computes commit = keccak256(secret).
func CommitFromSecret(secret [32]byte) common.Hash {
	return crypto.Keccak256Hash(secret[:])
}

// SignCommit produces (v, r, s) for the commit, matching the contract's signature verification:
//
//	msgHash = keccak256(abi.encode(
//	    address(this), block.chainid, commitLastBlock, commit,
//	    player, token, amount, betMask, modulo
//	))
//	ethSignedHash = keccak256("\x19Ethereum Signed Message:\n32" + msgHash)
//	ecrecover(ethSignedHash, v, r, s) == croupier
func SignCommit(
	key *ecdsa.PrivateKey,
	casinoAddr common.Address,
	chainID *big.Int,
	commitLastBlock *big.Int,
	commit *big.Int,
	player common.Address,
	token common.Address,
	amount *big.Int,
	betMask *big.Int,
	modulo *big.Int,
) (v uint8, r [32]byte, s [32]byte, err error) {

	// abi.encode: each field padded to 32 bytes
	packed := make([]byte, 0, 9*32)
	packed = append(packed, common.LeftPadBytes(casinoAddr.Bytes(), 32)...)
	packed = append(packed, math.U256Bytes(chainID)...)
	packed = append(packed, math.U256Bytes(commitLastBlock)...)
	packed = append(packed, math.U256Bytes(commit)...)
	packed = append(packed, common.LeftPadBytes(player.Bytes(), 32)...)
	packed = append(packed, common.LeftPadBytes(token.Bytes(), 32)...)
	packed = append(packed, math.U256Bytes(amount)...)
	packed = append(packed, math.U256Bytes(betMask)...)
	packed = append(packed, math.U256Bytes(modulo)...)

	msgHash := crypto.Keccak256(packed)

	// EIP-191 prefix
	prefixed := crypto.Keccak256(
		[]byte("\x19Ethereum Signed Message:\n32"),
		msgHash,
	)

	sig, err := crypto.Sign(prefixed, key)
	if err != nil {
		return 0, r, s, err
	}

	// sig = [R(32) || S(32) || V(1)]
	copy(r[:], sig[0:32])
	copy(s[:], sig[32:64])
	v = sig[64] + 27 // go-ethereum returns 0/1, Solidity expects 27/28

	return v, r, s, nil
}

// BuildSettleBetCalldata encodes settleBet(uint256 reveal, bytes32 blockHash).
func BuildSettleBetCalldata(secret [32]byte, blockHash common.Hash) []byte {
	data := make([]byte, 0, 4+32+32)
	data = append(data, SettleBetSelector[:]...)

	// reveal = uint256(secret)
	data = append(data, common.LeftPadBytes(secret[:], 32)...)

	// blockHash = bytes32
	data = append(data, blockHash.Bytes()...)

	return data
}

// BuildBetsCalldata encodes bets(uint256 commit) for reading on-chain bet data.
func BuildBetsCalldata(commit common.Hash) []byte {
	data := make([]byte, 0, 4+32)
	data = append(data, BetsSelector[:]...)
	data = append(data, commit.Bytes()...)
	return data
}

// SignTransaction creates a signed legacy (EIP-155) transaction.
func SignTransaction(
	key *ecdsa.PrivateKey,
	nonce uint64,
	to common.Address,
	value *big.Int,
	gasLimit uint64,
	gasPrice *big.Int,
	data []byte,
	chainID *big.Int,
) ([]byte, common.Hash, error) {
	// Use go-ethereum's types for proper signing
	tx := newLegacyTx(nonce, to, value, gasLimit, gasPrice, data)
	signedTx, err := signLegacyTx(tx, key, chainID)
	if err != nil {
		return nil, common.Hash{}, err
	}
	return signedTx, txHash(signedTx), nil
}
