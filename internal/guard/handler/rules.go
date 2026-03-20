// Package handler provides HTTP handlers for the Guard module.
package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/guard/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// RulesHandler handles guardrail rules CRUD endpoints.
type RulesHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewRulesHandler creates a new rules handler.
func NewRulesHandler(pg *store.PostgresStore, logger *slog.Logger) *RulesHandler {
	return &RulesHandler{pg: pg, logger: logger}
}

// createGuardrailRequest is the request body for creating a guardrail.
type createGuardrailRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Mode        string          `json:"mode"`
	Config      json.RawMessage `json:"config"`
	ApplyTo     string          `json:"apply_to"`
	Enabled     *bool           `json:"enabled,omitempty"`
	Priority    int             `json:"priority"`
}

// updateGuardrailRequest is the request body for updating a guardrail.
type updateGuardrailRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Mode        string          `json:"mode"`
	Config      json.RawMessage `json:"config"`
	ApplyTo     string          `json:"apply_to"`
	Enabled     *bool           `json:"enabled,omitempty"`
	Priority    *int            `json:"priority,omitempty"`
}

// validGuardTypes lists the allowed guardrail types.
var validGuardTypes = map[string]bool{
	"pii":          true,
	"toxicity":     true,
	"injection":    true,
	"hallucination": true,
	"topic":        true,
	"code_exec":    true,
	"length":       true,
	"custom":       true,
}

// validModes lists the allowed guardrail modes.
var validModes = map[string]bool{
	"block": true,
	"warn":  true,
	"log":   true,
}

// validApplyTo lists the allowed apply_to values.
var validApplyTo = map[string]bool{
	"input":  true,
	"output": true,
	"both":   true,
}

// List handles GET /v1/guard/rules.
func (h *RulesHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	guardrails, err := h.pg.ListGuardrails(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list guardrails", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list guardrails")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"guardrails": guardrails,
	})
}

// Get handles GET /v1/guard/rules/{id}.
func (h *RulesHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "guardrail ID is required")
		return
	}

	guardrail, err := h.pg.GetGuardrail(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get guardrail", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get guardrail")
		return
	}
	if guardrail == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "guardrail not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, guardrail)
}

// Create handles POST /v1/guard/rules.
func (h *RulesHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createGuardrailRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// Validate required fields
	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.Type == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "type is required")
		return
	}
	if !validGuardTypes[req.Type] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid guard type; must be one of: pii, toxicity, injection, hallucination, topic, code_exec, length, custom")
		return
	}

	// Defaults
	if req.Mode == "" {
		req.Mode = "block"
	}
	if !validModes[req.Mode] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid mode; must be one of: block, warn, log")
		return
	}
	if req.ApplyTo == "" {
		req.ApplyTo = "both"
	}
	if !validApplyTo[req.ApplyTo] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid apply_to; must be one of: input, output, both")
		return
	}
	if req.Config == nil {
		req.Config = json.RawMessage(`{}`)
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	guardrail := &store.Guardrail{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		Mode:        req.Mode,
		Config:      req.Config,
		ApplyTo:     req.ApplyTo,
		Enabled:     enabled,
		Priority:    req.Priority,
	}

	if err := h.pg.CreateGuardrail(r.Context(), guardrail); err != nil {
		h.logger.Error("failed to create guardrail", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create guardrail")
		return
	}

	h.logger.Info("created guardrail", "id", guardrail.ID, "name", guardrail.Name, "type", guardrail.Type, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusCreated, guardrail)
}

// Update handles PUT /v1/guard/rules/{id}.
func (h *RulesHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "guardrail ID is required")
		return
	}

	var req updateGuardrailRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetGuardrail(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get guardrail for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get guardrail")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "guardrail not found")
		return
	}

	// Apply partial updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Type != "" {
		if !validGuardTypes[req.Type] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid guard type")
			return
		}
		existing.Type = req.Type
	}
	if req.Mode != "" {
		if !validModes[req.Mode] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid mode")
			return
		}
		existing.Mode = req.Mode
	}
	if req.Config != nil {
		existing.Config = req.Config
	}
	if req.ApplyTo != "" {
		if !validApplyTo[req.ApplyTo] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid apply_to")
			return
		}
		existing.ApplyTo = req.ApplyTo
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	if req.Priority != nil {
		existing.Priority = *req.Priority
	}

	if err := h.pg.UpdateGuardrail(r.Context(), existing); err != nil {
		h.logger.Error("failed to update guardrail", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update guardrail")
		return
	}

	h.logger.Info("updated guardrail", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/guard/rules/{id}.
func (h *RulesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "guardrail ID is required")
		return
	}

	if err := h.pg.DeleteGuardrail(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "guardrail not found")
			return
		}
		h.logger.Error("failed to delete guardrail", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete guardrail")
		return
	}

	h.logger.Info("deleted guardrail", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}
