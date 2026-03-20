package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/guard/service"
	"github.com/agentstack/agentstack/internal/guard/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// CheckHandler handles guard check endpoints.
type CheckHandler struct {
	engine *service.Engine
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewCheckHandler creates a new check handler.
func NewCheckHandler(engine *service.Engine, pg *store.PostgresStore, logger *slog.Logger) *CheckHandler {
	return &CheckHandler{engine: engine, pg: pg, logger: logger}
}

// guardCheckRequest is the request body for POST /v1/guard/check.
type guardCheckRequest struct {
	Content      string   `json:"content"`
	Direction    string   `json:"direction"`
	GuardrailIDs []string `json:"guardrail_ids,omitempty"`
	SessionID    string   `json:"session_id,omitempty"`
}

// Check handles POST /v1/guard/check.
// Runs the specified (or all active) guardrails against the content in parallel,
// short-circuits on first block if mode=block.
func (h *CheckHandler) Check(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req guardCheckRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// Validate required fields
	if req.Content == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "content is required")
		return
	}
	if req.Direction == "" {
		req.Direction = "input"
	}
	if req.Direction != "input" && req.Direction != "output" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "direction must be 'input' or 'output'")
		return
	}

	// Run guards
	response, err := h.engine.RunGuards(r.Context(), orgID, req.Content, req.Direction, req.GuardrailIDs)
	if err != nil {
		h.logger.Error("failed to run guard checks", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GUARD_ERROR", "failed to execute guard checks")
		return
	}

	// Persist guard events asynchronously — never block the response on logging
	go h.persistEvents(orgID, req, response)

	httputil.WriteJSON(w, http.StatusOK, response)
}

// persistEvents stores guard check results as events in the database.
func (h *CheckHandler) persistEvents(orgID string, req guardCheckRequest, response *service.CheckResponse) {
	ctx := context.Background()

	for _, result := range response.Results {
		if result.Action == "not_checked" {
			continue // Don't persist stub results
		}

		var sessionID *string
		if req.SessionID != "" {
			sessionID = &req.SessionID
		}

		// Truncate input text for storage
		inputText := req.Content
		if len(inputText) > 1000 {
			inputText = inputText[:1000]
		}

		event := &store.GuardEvent{
			OrgID:       orgID,
			GuardrailID: result.GuardrailID,
			SessionID:   sessionID,
			Action:      result.Action,
			GuardType:   result.Type,
			InputText:   &inputText,
			Findings:    result.Findings,
			LatencyMs:   int(result.LatencyMs),
		}

		if err := h.pg.CreateGuardEvent(ctx, event); err != nil {
			h.logger.Error("failed to persist guard event",
				"guardrail_id", result.GuardrailID,
				"error", err,
			)
		}
	}
}
