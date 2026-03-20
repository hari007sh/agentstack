// Package gateway implements the core gateway proxy logic for the Route module.
package gateway

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/agentstack/agentstack/internal/route/provider"
	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/redis/go-redis/v9"
)

// SemanticCache provides SHA-256 based exact-match caching backed by Redis and PostgreSQL.
type SemanticCache struct {
	redis *redis.Client
	store *store.Store
	ttl   time.Duration
}

// NewSemanticCache creates a new SemanticCache.
func NewSemanticCache(redisClient *redis.Client, s *store.Store, ttl time.Duration) *SemanticCache {
	if ttl == 0 {
		ttl = time.Hour
	}
	return &SemanticCache{
		redis: redisClient,
		store: s,
		ttl:   ttl,
	}
}

// cacheNormalized is the struct used to compute a deterministic cache key.
type cacheNormalized struct {
	OrgID       string                   `json:"org_id"`
	Model       string                   `json:"model"`
	Messages    []provider.ChatMessage   `json:"messages"`
	Temperature *float64                 `json:"temperature,omitempty"`
	Tools       []provider.Tool          `json:"tools,omitempty"`
}

// CacheKey computes a SHA-256 hash of the normalized request for exact-match caching.
func CacheKey(orgID string, req *provider.ChatRequest) string {
	normalized := cacheNormalized{
		OrgID:       orgID,
		Model:       req.Model,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		Tools:       req.Tools,
	}
	data, _ := json.Marshal(normalized)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// Get looks up a cached response. Returns the response and true if found, nil and false otherwise.
func (c *SemanticCache) Get(ctx context.Context, orgID string, req *provider.ChatRequest) (*provider.ChatResponse, bool, error) {
	if c.redis == nil {
		return nil, false, nil
	}

	key := CacheKey(orgID, req)
	redisKey := fmt.Sprintf("agentstack:cache:%s:%s", orgID, key)

	// Fast path: Redis lookup
	data, err := c.redis.Get(ctx, redisKey).Bytes()
	if err == nil {
		var resp provider.ChatResponse
		if err := json.Unmarshal(data, &resp); err == nil {
			// Async increment hit count
			go func() {
				bgCtx := context.Background()
				_ = c.store.IncrementCacheHit(bgCtx, orgID, key, req.Model)
			}()
			return &resp, true, nil
		}
	}

	// Slow path: PostgreSQL lookup (handles Redis restarts)
	if c.store != nil {
		entry, err := c.store.GetCacheEntry(ctx, orgID, key, req.Model)
		if err == nil && entry != nil {
			var resp provider.ChatResponse
			if err := json.Unmarshal([]byte(entry.Response), &resp); err == nil {
				// Re-populate Redis
				go func() {
					bgCtx := context.Background()
					_ = c.redis.Set(bgCtx, redisKey, []byte(entry.Response), time.Until(entry.ExpiresAt)).Err()
					_ = c.store.IncrementCacheHit(bgCtx, orgID, key, req.Model)
				}()
				return &resp, true, nil
			}
		}
	}

	return nil, false, nil
}

// Set stores a response in the cache.
func (c *SemanticCache) Set(ctx context.Context, orgID string, req *provider.ChatRequest, resp *provider.ChatResponse) error {
	if c.redis == nil {
		return nil
	}

	key := CacheKey(orgID, req)
	redisKey := fmt.Sprintf("agentstack:cache:%s:%s", orgID, key)

	data, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("marshal response: %w", err)
	}

	// Store in Redis with TTL
	if err := c.redis.Set(ctx, redisKey, data, c.ttl).Err(); err != nil {
		return fmt.Errorf("redis set: %w", err)
	}

	// Async store in PostgreSQL for durability
	go func() {
		tokensSaved := 0
		if resp.Usage != nil {
			tokensSaved = resp.Usage.TotalTokens
		}
		_ = c.store.UpsertCacheEntry(context.Background(), &store.CacheEntry{
			OrgID:       orgID,
			CacheKey:    key,
			Model:       req.Model,
			RequestHash: key,
			Response:    string(data),
			TokensSaved: tokensSaved,
			ExpiresAt:   time.Now().Add(c.ttl),
		})
	}()

	return nil
}
