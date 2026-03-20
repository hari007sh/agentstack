package handler

import (
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
	"github.com/agentstack/agentstack/internal/trace/store"
	"github.com/go-chi/chi/v5"
)

// SessionHandler handles session query endpoints.
type SessionHandler struct {
	svc    *service.SessionService
	logger *slog.Logger
}

// NewSessionHandler creates a new session handler.
func NewSessionHandler(svc *service.SessionService, logger *slog.Logger) *SessionHandler {
	return &SessionHandler{svc: svc, logger: logger}
}

// ListSessions handles GET /v1/sessions.
func (h *SessionHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	q := r.URL.Query()
	filter := store.SessionFilter{
		AgentName: q.Get("agent_name"),
		Status:    q.Get("status"),
	}

	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			filter.Limit = n
		}
	}
	if v := q.Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			filter.Offset = n
		}
	}
	if v := q.Get("start_date"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.StartDate = &t
		}
	}
	if v := q.Get("end_date"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.EndDate = &t
		}
	}

	// Validate status if provided
	if filter.Status != "" && !isValidSessionStatus(filter.Status) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid status: must be one of running, completed, failed, timeout, healed")
		return
	}

	sessions, total, err := h.svc.ListSessions(r.Context(), orgID, filter)
	if err != nil {
		h.logger.Error("failed to list sessions", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list sessions")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
		"total":    total,
		"limit":    filter.Limit,
		"offset":   filter.Offset,
	})
}

// GetSession handles GET /v1/sessions/{id}.
func (h *SessionHandler) GetSession(w http.ResponseWriter, r *http.Request) {
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

	detail, err := h.svc.GetSession(r.Context(), orgID, sessionID)
	if err != nil {
		h.logger.Error("failed to get session", "id", sessionID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get session")
		return
	}
	if detail == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "session not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, detail)
}

// GetSessionSpans handles GET /v1/sessions/{id}/spans.
func (h *SessionHandler) GetSessionSpans(w http.ResponseWriter, r *http.Request) {
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

	spans, err := h.svc.GetSessionSpans(r.Context(), orgID, sessionID)
	if err != nil {
		h.logger.Error("failed to get session spans", "id", sessionID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get session spans")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"spans": spans,
	})
}

// GetSessionEvents handles GET /v1/sessions/{id}/events.
func (h *SessionHandler) GetSessionEvents(w http.ResponseWriter, r *http.Request) {
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

	events, err := h.svc.GetSessionEvents(r.Context(), orgID, sessionID)
	if err != nil {
		h.logger.Error("failed to get session events", "id", sessionID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get session events")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
	})
}

var validSessionStatuses = map[string]bool{
	"running":   true,
	"completed": true,
	"failed":    true,
	"timeout":   true,
	"healed":    true,
}

func isValidSessionStatus(s string) bool {
	return validSessionStatuses[s]
}
