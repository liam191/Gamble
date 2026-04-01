package main

import (
	"crypto/ecdsa"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/rlp"
)

func newLegacyTx(nonce uint64, to common.Address, value *big.Int, gasLimit uint64, gasPrice *big.Int, data []byte) *types.Transaction {
	if value == nil {
		value = big.NewInt(0)
	}
	return types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &to,
		Value:    value,
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     data,
	})
}

func signLegacyTx(tx *types.Transaction, key *ecdsa.PrivateKey, chainID *big.Int) ([]byte, error) {
	signer := types.NewEIP155Signer(chainID)
	signedTx, err := types.SignTx(tx, signer, key)
	if err != nil {
		return nil, err
	}
	raw, err := rlp.EncodeToBytes(signedTx)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

func txHash(rawTx []byte) common.Hash {
	return common.BytesToHash(crypto.Keccak256(rawTx))
}
