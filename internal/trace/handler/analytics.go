package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
)

// AnalyticsHandler handles analytics query endpoints.
type AnalyticsHandler struct {
	svc    *service.AnalyticsService
	logger *slog.Logger
}

// NewAnalyticsHandler creates a new analytics handler.
func NewAnalyticsHandler(svc *service.AnalyticsService, logger *slog.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{svc: svc, logger: logger}
}

// Overview handles GET /v1/analytics/overview.
func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	start, end := parseTimeRange(r)

	overview, err := h.svc.GetOverview(r.Context(), orgID, start, end)
	if err != nil {
		h.logger.Error("failed to get overview", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to compute overview analytics")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, overview)
}

// SessionsOverTime handles GET /v1/analytics/sessions-over-time.
func (h *AnalyticsHandler) SessionsOverTime(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	start, end := parseTimeRange(r)
	interval := parseInterval(r)

	points, err := h.svc.GetSessionsOverTime(r.Context(), orgID, start, end, interval)
	if err != nil {
		h.logger.Error("failed to get sessions over time", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to compute sessions over time")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data":     points,
		"start":    start.Format(time.RFC3339),
		"end":      end.Format(time.RFC3339),
		"interval": interval,
	})
}

// FailureRate handles GET /v1/analytics/failure-rate.
func (h *AnalyticsHandler) FailureRate(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	start, end := parseTimeRange(r)
	interval := parseInterval(r)

	points, err := h.svc.GetFailureRateOverTime(r.Context(), orgID, start, end, interval)
	if err != nil {
		h.logger.Error("failed to get failure rate", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to compute failure rate")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data":     points,
		"start":    start.Format(time.RFC3339),
		"end":      end.Format(time.RFC3339),
		"interval": interval,
	})
}

// --- Helpers ---

// parseTimeRange extracts start and end times from query parameters.
// Defaults to the last 24 hours.
func parseTimeRange(r *http.Request) (time.Time, time.Time) {
	q := r.URL.Query()
	now := time.Now().UTC()

	end := now
	start := now.Add(-24 * time.Hour)

	if v := q.Get("start"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			start = t
		}
	}
	if v := q.Get("end"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			end = t
		}
	}

	return start, end
}

// parseInterval extracts the interval in seconds from query parameters.
// Defaults to 3600 (1 hour).
func parseInterval(r *http.Request) int {
	if v := r.URL.Query().Get("interval"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 3600
}
