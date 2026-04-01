package main

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"
)

type RPCClient struct {
	eth     *ethclient.Client
	raw     *rpc.Client
	chainID *big.Int
}

func NewRPCClient(url string, expectedChainID int64) (*RPCClient, error) {
	raw, err := rpc.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("rpc dial: %w", err)
	}
	eth := ethclient.NewClient(raw)

	chainID, err := eth.ChainID(context.Background())
	if err != nil {
		return nil, fmt.Errorf("chainID query: %w", err)
	}
	if chainID.Int64() != expectedChainID {
		return nil, fmt.Errorf("chainID mismatch: got %d, expected %d", chainID.Int64(), expectedChainID)
	}

	return &RPCClient{eth: eth, raw: raw, chainID: chainID}, nil
}

func (r *RPCClient) BlockNumber() (uint64, error) {
	return r.eth.BlockNumber(context.Background())
}

func (r *RPCClient) GetBlockHash(blockNum uint64) (common.Hash, error) {
	block, err := r.eth.BlockByNumber(context.Background(), new(big.Int).SetUint64(blockNum))
	if err != nil {
		return common.Hash{}, err
	}
	return block.Hash(), nil
}

func (r *RPCClient) GetNonce(addr common.Address) (uint64, error) {
	return r.eth.NonceAt(context.Background(), addr, nil)
}

func (r *RPCClient) SendRawTx(rawTx []byte) (common.Hash, error) {
	var txHash common.Hash
	err := r.raw.CallContext(context.Background(), &txHash, "eth_sendRawTransaction", hexutil.Encode(rawTx))
	return txHash, err
}

func (r *RPCClient) GetTransactionReceipt(txHash common.Hash) (*types.Receipt, error) {
	return r.eth.TransactionReceipt(context.Background(), txHash)
}

func (r *RPCClient) GetTransactionByHash(txHash common.Hash) (*types.Transaction, bool, error) {
	return r.eth.TransactionByHash(context.Background(), txHash)
}

func (r *RPCClient) GetLogs(fromBlock, toBlock uint64, topics [][]common.Hash, addrs []common.Address) ([]types.Log, error) {
	query := ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(fromBlock),
		ToBlock:   new(big.Int).SetUint64(toBlock),
		Addresses: addrs,
		Topics:    topics,
	}
	return r.eth.FilterLogs(context.Background(), query)
}

// IsBetActive calls bets(uint256 commit) and checks if bet is active.
// Returns (active, error). Callers must handle error (RPC failure ≠ inactive).
func (r *RPCClient) IsBetActive(casinoAddr common.Address, commit common.Hash) (bool, error) {
	calldata := BuildBetsCalldata(commit)
	msg := ethereum.CallMsg{
		To:   &casinoAddr,
		Data: calldata,
	}
	result, err := r.eth.CallContract(context.Background(), msg, nil)
	if err != nil {
		return false, fmt.Errorf("eth_call failed: %w", err)
	}
	if len(result) < 32 {
		return false, fmt.Errorf("invalid response length: %d", len(result))
	}
	amount := new(big.Int).SetBytes(result[:32])
	return amount.Sign() > 0, nil
}

// CallCroupier reads the croupier() address from the casino contract.
func (r *RPCClient) CallCroupier(casinoAddr common.Address) (common.Address, error) {
	// croupier() selector
	selector := []byte{0x6b, 0x5c, 0x5f, 0x39} // keccak256("croupier()")[:4]
	msg := ethereum.CallMsg{
		To:   &casinoAddr,
		Data: selector,
	}
	result, err := r.eth.CallContract(context.Background(), msg, nil)
	if err != nil {
		return common.Address{}, err
	}
	if len(result) < 32 {
		return common.Address{}, fmt.Errorf("invalid croupier response")
	}
	return common.BytesToAddress(result[12:32]), nil
}
