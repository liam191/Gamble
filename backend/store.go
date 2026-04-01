package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type Store struct {
	client *redis.Client
	ctx    context.Context
}

func NewStore(redisURL string) (*Store, error) {
	client := redis.NewClient(&redis.Options{
		Addr: redisURL,
	})

	ctx := context.Background()

	// Verify connection
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	// Verify AOF is enabled
	info, err := client.ConfigGet(ctx, "appendonly").Result()
	if err != nil {
		log.Printf("[WARN] Could not verify Redis AOF: %v", err)
	} else if len(info) >= 2 {
		if val, ok := info["appendonly"]; ok && val != "yes" {
			log.Printf("[WARN] Redis AOF is not enabled (appendonly=%s). Secret durability at risk.", val)
		}
	}

	return &Store{client: client, ctx: ctx}, nil
}

// ── Commit key helpers ──

func commitKey(commitHash string) string {
	return "commit:" + commitHash
}

// ── Helpers ──

// truncHash safely truncates a hash string for logging.
func truncHash(h string) string {
	if len(h) > 14 {
		return h[:14]
	}
	return h
}

// ── Write helpers (fatal on error) ──

func mustWrite(err error) {
	if err != nil {
		log.Fatalf("FATAL: Redis write failed: %v", err)
	}
}

func mustWriteInt(val int64, err error) int64 {
	if err != nil {
		log.Fatalf("FATAL: Redis write failed: %v", err)
	}
	return val
}

// ── Commit CRUD ──

// SaveCommit stores a new commit with status=issued and 24h TTL (atomic).
func (s *Store) SaveCommit(commitHash string, fields map[string]interface{}) error {
	key := commitKey(commitHash)
	pipe := s.client.TxPipeline()
	pipe.HSet(s.ctx, key, fields)
	pipe.Expire(s.ctx, key, 24*time.Hour)
	_, err := pipe.Exec(s.ctx)
	return err
}

// GetCommitField reads a single field. Returns ("", nil) if field doesn't exist,
// ("", error) on Redis failure. Callers MUST check error for critical paths.
func (s *Store) GetCommitField(commitHash, field string) (string, error) {
	val, err := s.client.HGet(s.ctx, commitKey(commitHash), field).Result()
	if err == redis.Nil {
		return "", nil // field genuinely absent
	}
	if err != nil {
		return "", err // Redis error
	}
	return val, nil
}

// MustGetField reads a field; logs fatal on Redis error. Returns "" only for genuinely absent fields.
func (s *Store) MustGetField(commitHash, field string) string {
	val, err := s.GetCommitField(commitHash, field)
	if err != nil {
		log.Fatalf("FATAL: Redis read failed for %s.%s: %v", truncHash(commitHash), field, err)
	}
	return val
}

// GetCommitFields reads multiple fields. Fatal on Redis error.
func (s *Store) GetCommitFields(commitHash string, fields ...string) map[string]string {
	result := make(map[string]string)
	for _, f := range fields {
		result[f] = s.MustGetField(commitHash, f)
	}
	return result
}

// SetCommitFields sets multiple fields on a commit hash.
func (s *Store) SetCommitFields(commitHash string, fields map[string]interface{}) error {
	return s.client.HSet(s.ctx, commitKey(commitHash), fields).Err()
}

// SetCommitStatus sets status field.
func (s *Store) SetCommitStatus(commitHash, status string) error {
	return s.client.HSet(s.ctx, commitKey(commitHash), "status", status).Err()
}

// IncrRetryCount increments retryCount and returns the new value.
func (s *Store) IncrRetryCount(commitHash string) (int64, error) {
	return s.client.HIncrBy(s.ctx, commitKey(commitHash), "retryCount", 1).Result()
}

// PersistCommit removes TTL (for placed/sent states).
func (s *Store) PersistCommit(commitHash string) error {
	return s.client.Persist(s.ctx, commitKey(commitHash)).Err()
}

// ExpireCommit sets a new TTL.
func (s *Store) ExpireCommit(commitHash string, ttl time.Duration) error {
	return s.client.Expire(s.ctx, commitKey(commitHash), ttl).Err()
}

// DeleteCommitField removes a field (e.g., secret after confirmed).
func (s *Store) DeleteCommitField(commitHash, field string) error {
	return s.client.HDel(s.ctx, commitKey(commitHash), field).Err()
}

// ── Atomic transitions ──

// AtomicConfirm: status=confirmed + delete secret + set 7-day TTL (MULTI/EXEC).
func (s *Store) AtomicConfirm(commitHash string) error {
	key := commitKey(commitHash)
	pipe := s.client.TxPipeline()
	pipe.HSet(s.ctx, key, "status", StatusConfirmed)
	pipe.HDel(s.ctx, key, "secret")
	pipe.Expire(s.ctx, key, 7*24*time.Hour)
	_, err := pipe.Exec(s.ctx)
	return err
}

// CASTransition: Compare-And-Set — only transition if current status matches expected.
// Returns (transitioned bool, error).
var casScript = redis.NewScript(`
	local key = KEYS[1]
	local expected = ARGV[1]
	local current = redis.call('HGET', key, 'status')
	if current == expected then
		for i = 2, #ARGV, 2 do
			redis.call('HSET', key, ARGV[i], ARGV[i+1])
		end
		return 1
	end
	return 0
`)

func (s *Store) CASTransition(commitHash, expectedStatus string, fields ...string) (bool, error) {
	key := commitKey(commitHash)
	args := make([]interface{}, 0, 1+len(fields))
	args = append(args, expectedStatus)
	for _, f := range fields {
		args = append(args, f)
	}
	result, err := casScript.Run(s.ctx, s.client, []string{key}, args...).Int()
	if err != nil {
		return false, err
	}
	return result == 1, nil
}

// ── Scan by status ──

// ScanByStatus returns all commit hashes with a given status.
func (s *Store) ScanByStatus(status string) ([]string, error) {
	var commits []string
	var cursor uint64
	for {
		keys, next, err := s.client.Scan(s.ctx, cursor, "commit:*", 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			st, _ := s.client.HGet(s.ctx, key, "status").Result()
			if st == status {
				// Extract commit hash from key "commit:0x..."
				if len(key) > 7 {
					commits = append(commits, key[7:]) // strip "commit:"
				}
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return commits, nil
}

// ── Poller cursor ──

func (s *Store) GetLastScannedBlock() uint64 {
	val, err := s.client.Get(s.ctx, "poller:lastScannedBlock").Result()
	if err != nil {
		return 0
	}
	n, _ := strconv.ParseUint(val, 10, 64)
	return n
}

func (s *Store) SetLastScannedBlock(block uint64) error {
	return s.client.Set(s.ctx, "poller:lastScannedBlock", strconv.FormatUint(block, 10), 0).Err()
}

// ── History cursor ──

func (s *Store) GetHistoryCursor() uint64 {
	val, err := s.client.Get(s.ctx, "poller:lastHistoryBlock").Result()
	if err != nil {
		return 0
	}
	n, _ := strconv.ParseUint(val, 10, 64)
	return n
}

func (s *Store) SetHistoryCursor(block uint64) error {
	return s.client.Set(s.ctx, "poller:lastHistoryBlock", strconv.FormatUint(block, 10), 0).Err()
}

// ── History ──

func (s *Store) SaveHistory(commitHash string, entry HistoryEntry) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	return s.client.Set(s.ctx, "history:"+commitHash, string(data), 7*24*time.Hour).Err()
}

func (s *Store) GetRecentHistory(limit int) ([]HistoryEntry, error) {
	var entries []HistoryEntry
	var cursor uint64
	for {
		keys, next, err := s.client.Scan(s.ctx, cursor, "history:*", 100).Result()
		if err != nil {
			return nil, err
		}
		for _, key := range keys {
			val, err := s.client.Get(s.ctx, key).Result()
			if err != nil {
				continue
			}
			var entry HistoryEntry
			if json.Unmarshal([]byte(val), &entry) == nil {
				entries = append(entries, entry)
			}
			if len(entries) >= limit {
				return entries, nil
			}
		}
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return entries, nil
}

// ── Count active bets ──

func (s *Store) CountActiveStatuses() int {
	count := 0
	for _, status := range []string{StatusIssued, StatusPlaced, StatusSent, StatusFailed} {
		commits, err := s.ScanByStatus(status)
		if err == nil {
			count += len(commits)
		}
	}
	return count
}
