package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/shield/service"
	"github.com/go-chi/chi/v5"
)

// Valid healing types matching the ClickHouse Enum8.
var validHealingTypes = map[string]bool{
	"loop_breaker":        true,
	"hallucination_fix":   true,
	"cost_circuit_breaker": true,
	"timeout_handler":     true,
	"error_recovery":      true,
	"custom":              true,
}

// HealingHandler handles healing event endpoints.
type HealingHandler struct {
	svc    *service.HealingService
	logger *slog.Logger
}

// NewHealingHandler creates a new healing handler.
func NewHealingHandler(svc *service.HealingService, logger *slog.Logger) *HealingHandler {
	return &HealingHandler{svc: svc, logger: logger}
}

// IngestHealing handles POST /v1/ingest/healing.
func (h *HealingHandler) IngestHealing(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var events []service.HealingIngestRequest
	if err := httputil.ReadJSON(r, &events); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "expected a JSON array of healing events")
		return
	}

	if len(events) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "at least one healing event is required")
		return
	}

	for i, ev := range events {
		if ev.SessionID == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"session_id is required for healing event at index "+itoa(i))
			return
		}
		if ev.HealingType == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"healing_type is required for healing event at index "+itoa(i))
			return
		}
		if !validHealingTypes[ev.HealingType] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"invalid healing_type for healing event at index "+itoa(i)+
					": must be one of loop_breaker, hallucination_fix, cost_circuit_breaker, timeout_handler, error_recovery, custom")
			return
		}
	}

	if err := h.svc.IngestHealing(r.Context(), orgID, events); err != nil {
		h.logger.Error("failed to ingest healing events", "org_id", orgID, "count", len(events), "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "INGEST_ERROR", "failed to queue healing events for ingestion")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status": "accepted",
		"count":  len(events),
	})
}

// GetSessionHealing handles GET /v1/sessions/{id}/healing.
func (h *HealingHandler) GetSessionHealing(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	sessionID := chi.URLParam(r, "id")
	if sessionID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "session ID is required")
		return
	}

	events, err := h.svc.GetSessionHealing(r.Context(), orgID, sessionID)
	if err != nil {
		h.logger.Error("failed to get session healing events", "session_id", sessionID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get healing events")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"healing_events": events,
	})
}

// HealingAnalytics handles GET /v1/analytics/healing.
func (h *HealingHandler) HealingAnalytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	start, end := parseTimeRange(r)
	interval := parseInterval(r)

	analytics, err := h.svc.GetHealingAnalytics(r.Context(), orgID, start, end, interval)
	if err != nil {
		h.logger.Error("failed to get healing analytics", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to compute healing analytics")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, analytics)
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

// itoa converts a small integer to a string.
func itoa(i int) string {
	return strconv.Itoa(i)
}
