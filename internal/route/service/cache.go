package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/route/store"
)

// CacheService provides cache management operations.
type CacheService struct {
	store  *store.Store
	logger *slog.Logger
}

// NewCacheService creates a new CacheService.
func NewCacheService(s *store.Store, logger *slog.Logger) *CacheService {
	return &CacheService{store: s, logger: logger}
}

// Stats returns cache statistics for an organization.
func (cs *CacheService) Stats(ctx context.Context, orgID string) (*store.CacheStats, error) {
	return cs.store.GetCacheStats(ctx, orgID)
}

// Purge removes cache entries. If expiredOnly is true, only expired entries are removed.
func (cs *CacheService) Purge(ctx context.Context, orgID string, expiredOnly bool) (int64, error) {
	count, err := cs.store.PurgeCache(ctx, orgID, expiredOnly)
	if err != nil {
		return 0, err
	}
	cs.logger.Info("cache purged", "org_id", orgID, "expired_only", expiredOnly, "count", count)
	return count, nil
}

// GetEntry looks up a cache entry by key and model.
func (cs *CacheService) GetEntry(ctx context.Context, orgID, cacheKey, model string) (*store.CacheEntry, error) {
	return cs.store.GetCacheEntry(ctx, orgID, cacheKey, model)
}

// SetEntry stores a cache entry.
func (cs *CacheService) SetEntry(ctx context.Context, orgID, cacheKey, model, requestHash, response string, tokensSaved int, ttl time.Duration) error {
	return cs.store.UpsertCacheEntry(ctx, &store.CacheEntry{
		OrgID:       orgID,
		CacheKey:    cacheKey,
		Model:       model,
		RequestHash: requestHash,
		Response:    response,
		TokensSaved: tokensSaved,
		ExpiresAt:   time.Now().Add(ttl),
	})
}
