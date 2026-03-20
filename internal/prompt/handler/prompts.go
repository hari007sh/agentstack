// Package handler provides HTTP handlers for the Prompt module.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/prompt/service"
	"github.com/agentstack/agentstack/internal/prompt/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// PromptsHandler handles prompt CRUD endpoints.
type PromptsHandler struct {
	svc    *service.PromptService
	logger *slog.Logger
}

// NewPromptsHandler creates a new prompts handler.
func NewPromptsHandler(svc *service.PromptService, logger *slog.Logger) *PromptsHandler {
	return &PromptsHandler{svc: svc, logger: logger}
}

// createPromptRequest is the request body for creating a prompt.
type createPromptRequest struct {
	Slug         string          `json:"slug"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Body         string          `json:"body"`
	Model        string          `json:"model"`
	SystemPrompt string          `json:"system_prompt"`
	Variables    json.RawMessage `json:"variables"`
	Config       json.RawMessage `json:"config"`
	Tags         []string        `json:"tags"`
	Metadata     json.RawMessage `json:"metadata"`
}

// updatePromptRequest is the request body for updating a prompt.
type updatePromptRequest struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	Tags        []string         `json:"tags"`
	Metadata    json.RawMessage  `json:"metadata"`
}

// Create handles POST /v1/prompts.
func (h *PromptsHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createPromptRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	input := service.CreatePromptInput{
		Slug:         req.Slug,
		Name:         req.Name,
		Description:  req.Description,
		Body:         req.Body,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		Variables:    req.Variables,
		Config:       req.Config,
		Tags:         req.Tags,
		Metadata:     req.Metadata,
	}

	result, err := h.svc.CreatePrompt(r.Context(), orgID, input)
	if err != nil {
		h.logger.Error("failed to create prompt", "org_id", orgID, "error", err)
		// Check for validation errors
		if isValidationError(err) {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		if err.Error() == "slug already exists" {
			httputil.WriteError(w, http.StatusConflict, "SLUG_EXISTS", "a prompt with this slug already exists")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create prompt")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, result)
}

// List handles GET /v1/prompts.
func (h *PromptsHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	q := r.URL.Query()

	limit := 50
	if v := q.Get("per_page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "per_page must be between 1 and 200")
			return
		}
		limit = n
	}

	page := 1
	if v := q.Get("page"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "page must be >= 1")
			return
		}
		page = n
	}

	offset := (page - 1) * limit

	filter := store.PromptFilter{
		Search: q.Get("search"),
		Tag:    q.Get("tag"),
		Limit:  limit,
		Offset: offset,
	}

	prompts, total, err := h.svc.ListPrompts(r.Context(), orgID, filter)
	if err != nil {
		h.logger.Error("failed to list prompts", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list prompts")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": prompts,
		"meta": map[string]interface{}{
			"page":     page,
			"per_page": limit,
			"total":    total,
		},
	})
}

// Get handles GET /v1/prompts/{id}.
func (h *PromptsHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	result, err := h.svc.GetPrompt(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get prompt", "org_id", orgID, "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get prompt")
		return
	}
	if result == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, result)
}

// GetBySlug handles GET /v1/prompts/slug/{slug}.
func (h *PromptsHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	slug := chi.URLParam(r, "slug")
	if slug == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "slug is required")
		return
	}

	result, err := h.svc.GetPromptBySlug(r.Context(), orgID, slug)
	if err != nil {
		h.logger.Error("failed to get prompt by slug", "org_id", orgID, "slug", slug, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get prompt")
		return
	}
	if result == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, result)
}

// Update handles PATCH /v1/prompts/{id}.
func (h *PromptsHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	var req updatePromptRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	input := service.UpdatePromptInput{
		Name:        req.Name,
		Description: req.Description,
		Tags:        req.Tags,
		Metadata:    req.Metadata,
	}

	result, err := h.svc.UpdatePrompt(r.Context(), orgID, id, input)
	if err != nil {
		h.logger.Error("failed to update prompt", "org_id", orgID, "id", id, "error", err)
		if isValidationError(err) {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error())
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update prompt")
		return
	}
	if result == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, result)
}

// Delete handles DELETE /v1/prompts/{id}.
func (h *PromptsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	if err := h.svc.DeletePrompt(r.Context(), orgID, id); err != nil {
		h.logger.Error("failed to delete prompt", "org_id", orgID, "id", id, "error", err)
		if err.Error() == "delete prompt: prompt not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete prompt")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// isValidationError checks if an error is a user-input validation error.
func isValidationError(err error) bool {
	msg := err.Error()
	validationPrefixes := []string{
		"slug ",
		"name ",
		"body ",
	}
	for _, prefix := range validationPrefixes {
		if len(msg) >= len(prefix) && msg[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}
