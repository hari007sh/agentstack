// Package handler provides HTTP handlers for the Cost module.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/agentstack/agentstack/internal/cost/service"
	"github.com/agentstack/agentstack/internal/cost/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// EventsHandler handles cost event endpoints.
type EventsHandler struct {
	tracker *service.TrackerService
	logger  *slog.Logger
}

// NewEventsHandler creates a new cost events handler.
func NewEventsHandler(tracker *service.TrackerService, logger *slog.Logger) *EventsHandler {
	return &EventsHandler{tracker: tracker, logger: logger}
}

// recordEventRequest is the request body for recording a single cost event.
type recordEventRequest struct {
	SessionID    string          `json:"session_id"`
	SpanID       string          `json:"span_id"`
	AgentName    string          `json:"agent_name"`
	Model        string          `json:"model"`
	Provider     string          `json:"provider"`
	InputTokens  int             `json:"input_tokens"`
	OutputTokens int             `json:"output_tokens"`
	TotalTokens  int             `json:"total_tokens"`
	CostCents    int             `json:"cost_cents"`
	Outcome      string          `json:"outcome"`
	Metadata     json.RawMessage `json:"metadata"`
}

// recordEventsRequest supports both single event and batch recording.
type recordEventsRequest struct {
	// Single event fields (flat)
	recordEventRequest

	// Batch events
	Events []recordEventRequest `json:"events"`
}

// Record handles POST /v1/cost/events — record cost event(s).
func (h *EventsHandler) Record(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req recordEventsRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// If batch events provided, use batch path
	if len(req.Events) > 0 {
		h.recordBatch(w, r, orgID, req.Events)
		return
	}

	// Single event path
	if req.Model == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "model is required")
		return
	}
	if req.Provider == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "provider is required")
		return
	}

	event := &store.CostEvent{
		SessionID:    req.SessionID,
		SpanID:       req.SpanID,
		AgentName:    req.AgentName,
		Model:        req.Model,
		Provider:     req.Provider,
		InputTokens:  req.InputTokens,
		OutputTokens: req.OutputTokens,
		TotalTokens:  req.TotalTokens,
		CostCents:    req.CostCents,
		Outcome:      req.Outcome,
		Metadata:     req.Metadata,
	}

	if err := h.tracker.RecordEvent(r.Context(), orgID, event); err != nil {
		h.logger.Error("failed to record cost event", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "RECORD_ERROR", "failed to record cost event")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, event)
}

func (h *EventsHandler) recordBatch(w http.ResponseWriter, r *http.Request, orgID string, reqs []recordEventRequest) {
	if len(reqs) > 1000 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "maximum 1000 events per batch")
		return
	}

	events := make([]store.CostEvent, 0, len(reqs))
	for i, req := range reqs {
		if req.Model == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"model is required for event at index "+strconv.Itoa(i))
			return
		}
		if req.Provider == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"provider is required for event at index "+strconv.Itoa(i))
			return
		}

		events = append(events, store.CostEvent{
			SessionID:    req.SessionID,
			SpanID:       req.SpanID,
			AgentName:    req.AgentName,
			Model:        req.Model,
			Provider:     req.Provider,
			InputTokens:  req.InputTokens,
			OutputTokens: req.OutputTokens,
			TotalTokens:  req.TotalTokens,
			CostCents:    req.CostCents,
			Outcome:      req.Outcome,
			Metadata:     req.Metadata,
		})
	}

	if err := h.tracker.RecordEvents(r.Context(), orgID, events); err != nil {
		h.logger.Error("failed to record cost events batch", "org_id", orgID, "count", len(events), "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "RECORD_ERROR", "failed to record cost events")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"recorded": len(events),
		"events":   events,
	})
}

// List handles GET /v1/cost/events — list cost events with filters.
func (h *EventsHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	q := r.URL.Query()

	filter := store.CostEventFilter{
		AgentName: q.Get("agent_name"),
		Model:     q.Get("model"),
		Provider:  q.Get("provider"),
		Outcome:   q.Get("outcome"),
	}

	if v := q.Get("from"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid 'from' date; use RFC3339 format")
			return
		}
		filter.From = t
	}
	if v := q.Get("to"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid 'to' date; use RFC3339 format")
			return
		}
		filter.To = t
	}

	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 1000 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "limit must be between 1 and 1000")
			return
		}
		filter.Limit = n
	} else {
		filter.Limit = 50
	}

	if v := q.Get("offset"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "offset must be >= 0")
			return
		}
		filter.Offset = n
	}

	events, total, err := h.tracker.GetEvents(r.Context(), orgID, filter)
	if err != nil {
		h.logger.Error("failed to list cost events", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list cost events")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}
