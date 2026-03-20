package handler

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
	"github.com/go-chi/chi/v5"
)

// PatternHandler handles failure pattern CRUD endpoints.
type PatternHandler struct {
	svc    *service.PatternService
	logger *slog.Logger
}

// NewPatternHandler creates a new pattern handler.
func NewPatternHandler(svc *service.PatternService, logger *slog.Logger) *PatternHandler {
	return &PatternHandler{svc: svc, logger: logger}
}

// List handles GET /v1/patterns.
func (h *PatternHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	patterns, err := h.svc.ListPatterns(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list patterns", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list failure patterns")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"patterns": patterns,
	})
}

// Get handles GET /v1/patterns/{id}.
func (h *PatternHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "pattern ID is required")
		return
	}

	pattern, err := h.svc.GetPattern(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get pattern", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get failure pattern")
		return
	}
	if pattern == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "failure pattern not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, pattern)
}

// Create handles POST /v1/patterns.
func (h *PatternHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req service.CreatePatternRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.Category == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "category is required")
		return
	}
	if !isValidCategory(req.Category) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid category: must be one of loop, hallucination, timeout, error, cost, custom")
		return
	}
	if req.Severity == "" {
		req.Severity = "medium"
	}
	if !isValidSeverity(req.Severity) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid severity: must be one of low, medium, high, critical")
		return
	}

	pattern, err := h.svc.CreatePattern(r.Context(), orgID, &req)
	if err != nil {
		h.logger.Error("failed to create pattern", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create failure pattern")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, pattern)
}

// Update handles PUT /v1/patterns/{id}.
func (h *PatternHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "pattern ID is required")
		return
	}

	var req service.UpdatePatternRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Category != "" && !isValidCategory(req.Category) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid category: must be one of loop, hallucination, timeout, error, cost, custom")
		return
	}
	if req.Severity != "" && !isValidSeverity(req.Severity) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid severity: must be one of low, medium, high, critical")
		return
	}

	pattern, err := h.svc.UpdatePattern(r.Context(), orgID, id, &req)
	if err != nil {
		h.logger.Error("failed to update pattern", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update failure pattern")
		return
	}
	if pattern == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "failure pattern not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, pattern)
}

// Delete handles DELETE /v1/patterns/{id}.
func (h *PatternHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "pattern ID is required")
		return
	}

	if err := h.svc.DeletePattern(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "failure pattern not found")
			return
		}
		h.logger.Error("failed to delete pattern", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete failure pattern")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// --- Validation ---

var validCategories = map[string]bool{
	"loop":          true,
	"hallucination": true,
	"timeout":       true,
	"error":         true,
	"cost":          true,
	"custom":        true,
}

func isValidCategory(c string) bool {
	return validCategories[c]
}

var validSeverities = map[string]bool{
	"low":      true,
	"medium":   true,
	"high":     true,
	"critical": true,
}

func isValidSeverity(s string) bool {
	return validSeverities[s]
}
