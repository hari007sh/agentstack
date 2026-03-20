package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/cost/service"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// AnalyticsHandler handles cost analytics endpoints.
type AnalyticsHandler struct {
	analytics *service.AnalyticsService
	logger    *slog.Logger
}

// NewAnalyticsHandler creates a new cost analytics handler.
func NewAnalyticsHandler(analytics *service.AnalyticsService, logger *slog.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{analytics: analytics, logger: logger}
}

// parseDateRange extracts from/to query params with defaults (last 30 days).
func parseDateRange(r *http.Request) (time.Time, time.Time, error) {
	q := r.URL.Query()
	now := time.Now().UTC()

	from := now.AddDate(0, 0, -30) // default: last 30 days
	to := now

	if v := q.Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		from = t
	}
	if v := q.Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
		to = t
	}

	return from, to, nil
}

// Summary handles GET /v1/cost/analytics/summary.
func (h *AnalyticsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid date format; use RFC3339")
		return
	}

	summary, err := h.analytics.GetSummary(r.Context(), orgID, from, to)
	if err != nil {
		h.logger.Error("failed to get cost summary", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get cost summary")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, summary)
}

// ByModel handles GET /v1/cost/analytics/by-model.
func (h *AnalyticsHandler) ByModel(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid date format; use RFC3339")
		return
	}

	models, err := h.analytics.GetByModel(r.Context(), orgID, from, to)
	if err != nil {
		h.logger.Error("failed to get cost by model", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get cost by model")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"models": models,
	})
}

// ByAgent handles GET /v1/cost/analytics/by-agent.
func (h *AnalyticsHandler) ByAgent(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid date format; use RFC3339")
		return
	}

	agents, err := h.analytics.GetByAgent(r.Context(), orgID, from, to)
	if err != nil {
		h.logger.Error("failed to get cost by agent", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get cost by agent")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"agents": agents,
	})
}

// TopSpenders handles GET /v1/cost/analytics/top-spenders.
func (h *AnalyticsHandler) TopSpenders(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid date format; use RFC3339")
		return
	}

	limit := 10
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}

	spenders, err := h.analytics.GetTopSpenders(r.Context(), orgID, from, to, limit)
	if err != nil {
		h.logger.Error("failed to get top spenders", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get top spenders")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"spenders": spenders,
	})
}

// Compare handles GET /v1/cost/analytics/compare — compare model costs.
func (h *AnalyticsHandler) Compare(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	from, to, err := parseDateRange(r)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid date format; use RFC3339")
		return
	}

	comparisons, err := h.analytics.CompareModels(r.Context(), orgID, from, to)
	if err != nil {
		h.logger.Error("failed to compare models", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to compare models")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"comparisons": comparisons,
	})
}
