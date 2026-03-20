package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// AnalyticsHandler handles gateway analytics endpoints.
type AnalyticsHandler struct {
	store  *store.Store
	logger *slog.Logger
}

// NewAnalyticsHandler creates a new AnalyticsHandler.
func NewAnalyticsHandler(s *store.Store, logger *slog.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{store: s, logger: logger}
}

// GetAnalytics handles GET /v1/gateway/analytics.
// Query parameters:
//   - from: start time (RFC3339), defaults to 24 hours ago
//   - to: end time (RFC3339), defaults to now
func (h *AnalyticsHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	now := time.Now().UTC()
	from := now.Add(-24 * time.Hour)
	to := now

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		parsed, err := time.Parse(time.RFC3339, fromStr)
		if err == nil {
			from = parsed
		}
	}
	if toStr := r.URL.Query().Get("to"); toStr != "" {
		parsed, err := time.Parse(time.RFC3339, toStr)
		if err == nil {
			to = parsed
		}
	}

	analytics, err := h.store.GetGatewayAnalytics(r.Context(), orgID, from, to)
	if err != nil {
		h.logger.Error("get gateway analytics", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get gateway analytics")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"from":      from.Format(time.RFC3339),
		"to":        to.Format(time.RFC3339),
		"analytics": analytics,
	})
}
