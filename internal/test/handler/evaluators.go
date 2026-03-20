package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/test/store"
	"github.com/go-chi/chi/v5"
)

// EvaluatorHandler handles evaluator CRUD endpoints.
type EvaluatorHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewEvaluatorHandler creates a new evaluator handler.
func NewEvaluatorHandler(pg *store.PostgresStore, logger *slog.Logger) *EvaluatorHandler {
	return &EvaluatorHandler{pg: pg, logger: logger}
}

// createEvaluatorRequest is the request body for creating an evaluator.
type createEvaluatorRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Subtype     string          `json:"subtype"`
	Config      json.RawMessage `json:"config"`
}

// updateEvaluatorRequest is the request body for updating an evaluator.
type updateEvaluatorRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Subtype     string          `json:"subtype"`
	Config      json.RawMessage `json:"config"`
}

// validEvalTypes are the allowed evaluator types.
var validEvalTypes = map[string]bool{
	"llm_judge":    true,
	"programmatic": true,
	"composite":    true,
}

// List handles GET /v1/test/evaluators.
func (h *EvaluatorHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	evals, err := h.pg.ListEvaluators(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list evaluators", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list evaluators")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"evaluators": evals,
	})
}

// Get handles GET /v1/test/evaluators/{id}.
func (h *EvaluatorHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "evaluator ID is required")
		return
	}

	eval, err := h.pg.GetEvaluator(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get evaluator", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get evaluator")
		return
	}
	if eval == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "evaluator not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, eval)
}

// Create handles POST /v1/test/evaluators.
func (h *EvaluatorHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createEvaluatorRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.Type == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "type is required")
		return
	}
	if !validEvalTypes[req.Type] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid type: must be one of llm_judge, programmatic, composite")
		return
	}
	if req.Config == nil {
		req.Config = json.RawMessage("{}")
	}

	eval := &store.Evaluator{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Type:        req.Type,
		Subtype:     req.Subtype,
		Config:      req.Config,
		IsBuiltin:   false,
	}

	if err := h.pg.CreateEvaluator(r.Context(), eval); err != nil {
		h.logger.Error("failed to create evaluator", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create evaluator")
		return
	}

	h.logger.Info("created evaluator", "id", eval.ID, "name", eval.Name, "type", eval.Type, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusCreated, eval)
}

// Update handles PUT /v1/test/evaluators/{id}.
func (h *EvaluatorHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "evaluator ID is required")
		return
	}

	var req updateEvaluatorRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetEvaluator(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get evaluator for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get evaluator")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "evaluator not found")
		return
	}

	if existing.IsBuiltin {
		httputil.WriteError(w, http.StatusForbidden, "FORBIDDEN", "cannot modify built-in evaluators")
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
		if !validEvalTypes[req.Type] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"invalid type: must be one of llm_judge, programmatic, composite")
			return
		}
		existing.Type = req.Type
	}
	if req.Subtype != "" {
		existing.Subtype = req.Subtype
	}
	if req.Config != nil {
		existing.Config = req.Config
	}

	if err := h.pg.UpdateEvaluator(r.Context(), existing); err != nil {
		h.logger.Error("failed to update evaluator", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update evaluator")
		return
	}

	h.logger.Info("updated evaluator", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/test/evaluators/{id}.
func (h *EvaluatorHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "evaluator ID is required")
		return
	}

	// Check if it's a builtin before deleting
	existing, err := h.pg.GetEvaluator(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get evaluator for delete", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get evaluator")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "evaluator not found")
		return
	}
	if existing.IsBuiltin {
		httputil.WriteError(w, http.StatusForbidden, "FORBIDDEN", "cannot delete built-in evaluators")
		return
	}

	if err := h.pg.DeleteEvaluator(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "evaluator not found")
			return
		}
		h.logger.Error("failed to delete evaluator", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete evaluator")
		return
	}

	h.logger.Info("deleted evaluator", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}
