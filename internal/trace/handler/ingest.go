package handler

import (
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
)

// IngestHandler handles trace data ingestion endpoints.
type IngestHandler struct {
	svc    *service.IngestService
	logger *slog.Logger
}

// NewIngestHandler creates a new ingest handler.
func NewIngestHandler(svc *service.IngestService, logger *slog.Logger) *IngestHandler {
	return &IngestHandler{svc: svc, logger: logger}
}

// IngestSession handles POST /v1/ingest/sessions.
func (h *IngestHandler) IngestSession(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req service.SessionIngestRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.AgentName == "" && req.AgentID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "agent_name or agent_id is required")
		return
	}

	if err := h.svc.IngestSession(orgID, &req); err != nil {
		h.logger.Error("failed to ingest session", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "INGEST_ERROR", "failed to queue session for ingestion")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":     "accepted",
		"session_id": req.ID,
	})
}

// IngestSpans handles POST /v1/ingest/spans.
func (h *IngestHandler) IngestSpans(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	// Accept either a single span or an array of spans.
	var spans []service.SpanIngestRequest

	// Try array first
	if err := httputil.ReadJSON(r, &spans); err != nil {
		// Reset body is consumed; require array format
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "expected a JSON array of spans")
		return
	}

	if len(spans) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "at least one span is required")
		return
	}

	// Validate each span
	for i, sp := range spans {
		if sp.SessionID == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"session_id is required for span at index "+itoa(i))
			return
		}
		if sp.SpanType == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"span_type is required for span at index "+itoa(i))
			return
		}
		if !isValidSpanType(sp.SpanType) {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"invalid span_type for span at index "+itoa(i)+": must be one of llm_call, tool_call, retrieval, chain, agent, custom")
			return
		}
	}

	if err := h.svc.IngestSpans(orgID, spans); err != nil {
		h.logger.Error("failed to ingest spans", "org_id", orgID, "count", len(spans), "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "INGEST_ERROR", "failed to queue spans for ingestion")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status": "accepted",
		"count":  len(spans),
	})
}

// IngestEvents handles POST /v1/ingest/events.
func (h *IngestHandler) IngestEvents(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var events []service.EventIngestRequest
	if err := httputil.ReadJSON(r, &events); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "expected a JSON array of events")
		return
	}

	if len(events) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "at least one event is required")
		return
	}

	for i, ev := range events {
		if ev.SessionID == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"session_id is required for event at index "+itoa(i))
			return
		}
	}

	if err := h.svc.IngestEvents(orgID, events); err != nil {
		h.logger.Error("failed to ingest events", "org_id", orgID, "count", len(events), "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "INGEST_ERROR", "failed to queue events for ingestion")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status": "accepted",
		"count":  len(events),
	})
}

// IngestBatch handles POST /v1/ingest/batch.
func (h *IngestHandler) IngestBatch(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req service.BatchIngestRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	totalItems := len(req.Sessions) + len(req.Spans) + len(req.Events)
	if totalItems == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "batch must contain at least one session, span, or event")
		return
	}

	// Validate spans
	for i, sp := range req.Spans {
		if sp.SessionID == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"session_id is required for span at index "+itoa(i))
			return
		}
		if sp.SpanType != "" && !isValidSpanType(sp.SpanType) {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"invalid span_type for span at index "+itoa(i))
			return
		}
	}

	// Validate events
	for i, ev := range req.Events {
		if ev.SessionID == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"session_id is required for event at index "+itoa(i))
			return
		}
	}

	result, err := h.svc.IngestBatch(orgID, &req)
	if err != nil {
		h.logger.Error("failed to ingest batch", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "INGEST_ERROR", "failed to queue batch for ingestion")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":   "accepted",
		"sessions": result.Sessions,
		"spans":    result.Spans,
		"events":   result.Events,
	})
}

// --- Helpers ---

var validSpanTypes = map[string]bool{
	"llm_call":  true,
	"tool_call": true,
	"retrieval": true,
	"chain":     true,
	"agent":     true,
	"custom":    true,
}

func isValidSpanType(t string) bool {
	return validSpanTypes[t]
}

func itoa(i int) string {
	if i < 10 {
		return string(rune('0' + i))
	}
	return intToStr(i)
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	digits := make([]byte, 0, 10)
	for n > 0 {
		digits = append(digits, byte('0'+n%10))
		n /= 10
	}
	// Reverse
	for i, j := 0, len(digits)-1; i < j; i, j = i+1, j-1 {
		digits[i], digits[j] = digits[j], digits[i]
	}
	return string(digits)
}
