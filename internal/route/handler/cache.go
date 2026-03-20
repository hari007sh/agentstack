package handler

import (
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// CacheHandler handles cache management endpoints.
type CacheHandler struct {
	store  *store.Store
	logger *slog.Logger
}

// NewCacheHandler creates a new CacheHandler.
func NewCacheHandler(s *store.Store, logger *slog.Logger) *CacheHandler {
	return &CacheHandler{store: s, logger: logger}
}

// purgeRequest is the JSON body for the cache purge endpoint.
type purgeRequest struct {
	ExpiredOnly bool `json:"expired_only"`
}

// Stats handles GET /v1/gateway/cache/stats.
func (h *CacheHandler) Stats(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	stats, err := h.store.GetCacheStats(r.Context(), orgID)
	if err != nil {
		h.logger.Error("get cache stats", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get cache stats")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, stats)
}

// Purge handles POST /v1/gateway/cache/purge.
func (h *CacheHandler) Purge(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	var req purgeRequest
	// Allow empty body (default: purge all)
	_ = httputil.ReadJSON(r, &req)

	count, err := h.store.PurgeCache(r.Context(), orgID, req.ExpiredOnly)
	if err != nil {
		h.logger.Error("purge cache", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to purge cache")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"status":        "purged",
		"entries_removed": count,
		"expired_only":   req.ExpiredOnly,
	})
}
