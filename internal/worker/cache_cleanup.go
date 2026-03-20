package worker

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/cost/store"
)

const cacheCleanupInterval = 5 * time.Minute

// CacheCleanup periodically deletes expired semantic cache entries
// from the cache_entries table in PostgreSQL.
type CacheCleanup struct {
	pg     *store.PostgresStore
	logger *slog.Logger
	done   chan struct{}
}

// NewCacheCleanup creates a new cache cleanup worker.
func NewCacheCleanup(pgDB *sql.DB, logger *slog.Logger) *CacheCleanup {
	return &CacheCleanup{
		pg:     store.NewPostgresStore(pgDB),
		logger: logger,
		done:   make(chan struct{}),
	}
}

// Start begins the periodic cache cleanup loop.
func (cc *CacheCleanup) Start() {
	cc.logger.Info("cache cleanup started", "interval", cacheCleanupInterval)
	go cc.loop()
}

// Stop terminates the cache cleanup loop.
func (cc *CacheCleanup) Stop() {
	close(cc.done)
	cc.logger.Info("cache cleanup stopped")
}

func (cc *CacheCleanup) loop() {
	ticker := time.NewTicker(cacheCleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			cc.run()
		case <-cc.done:
			return
		}
	}
}

func (cc *CacheCleanup) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	deleted, err := cc.pg.DeleteExpiredCacheEntries(ctx)
	if err != nil {
		cc.logger.Error("failed to clean up expired cache entries", "error", err)
		return
	}

	if deleted > 0 {
		cc.logger.Info("cleaned up expired cache entries", "deleted", deleted)
	}
}
