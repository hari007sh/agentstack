package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/guard/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// EventsHandler handles guard event query endpoints.
type EventsHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewEventsHandler creates a new events handler.
func NewEventsHandler(pg *store.PostgresStore, logger *slog.Logger) *EventsHandler {
	return &EventsHandler{pg: pg, logger: logger}
}

// ListEvents handles GET /v1/guard/events.
func (h *EventsHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	// Parse query params
	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = v
		}
	}

	action := r.URL.Query().Get("action")
	guardType := r.URL.Query().Get("guard_type")

	events, total, err := h.pg.ListGuardEvents(r.Context(), orgID, limit, offset, action, guardType)
	if err != nil {
		h.logger.Error("failed to list guard events", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list guard events")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// Analytics handles GET /v1/guard/analytics.
func (h *EventsHandler) Analytics(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	analytics, err := h.pg.GetGuardAnalytics(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to get guard analytics", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get guard analytics")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, analytics)
}
