package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/prompt/service"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// VersionsHandler handles prompt version endpoints.
type VersionsHandler struct {
	svc    *service.VersionService
	logger *slog.Logger
}

// NewVersionsHandler creates a new versions handler.
func NewVersionsHandler(svc *service.VersionService, logger *slog.Logger) *VersionsHandler {
	return &VersionsHandler{svc: svc, logger: logger}
}

// createVersionRequest is the request body for creating a new version.
type createVersionRequest struct {
	Body         string          `json:"body"`
	Model        string          `json:"model"`
	SystemPrompt string          `json:"system_prompt"`
	Variables    json.RawMessage `json:"variables"`
	Config       json.RawMessage `json:"config"`
	ChangeNote   string          `json:"change_note"`
}

// Create handles POST /v1/prompts/{id}/versions.
func (h *VersionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	promptID := chi.URLParam(r, "id")
	if promptID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	var req createVersionRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// Use the API key prefix as the creator identifier
	createdBy := middleware.GetOrgID(r.Context()) // fallback to orgID
	if keyID := r.Context().Value(middleware.APIKeyIDKey); keyID != nil {
		if s, ok := keyID.(string); ok {
			createdBy = s
		}
	}

	input := service.CreateVersionInput{
		Body:         req.Body,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
		Variables:    req.Variables,
		Config:       req.Config,
		ChangeNote:   req.ChangeNote,
	}

	version, err := h.svc.CreateVersion(r.Context(), orgID, promptID, createdBy, input)
	if err != nil {
		h.logger.Error("failed to create version", "org_id", orgID, "prompt_id", promptID, "error", err)
		if err.Error() == "prompt not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		if err.Error() == "body is required" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "body is required")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create version")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, version)
}

// List handles GET /v1/prompts/{id}/versions.
func (h *VersionsHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	promptID := chi.URLParam(r, "id")
	if promptID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	versions, err := h.svc.ListVersions(r.Context(), orgID, promptID)
	if err != nil {
		h.logger.Error("failed to list versions", "org_id", orgID, "prompt_id", promptID, "error", err)
		if err.Error() == "prompt not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list versions")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": versions,
		"meta": map[string]interface{}{
			"total": len(versions),
		},
	})
}

// Get handles GET /v1/prompts/{id}/versions/{version}.
func (h *VersionsHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	promptID := chi.URLParam(r, "id")
	if promptID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	versionStr := chi.URLParam(r, "version")
	versionNum, err := strconv.Atoi(versionStr)
	if err != nil || versionNum < 1 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "version must be a positive integer")
		return
	}

	version, err := h.svc.GetVersion(r.Context(), orgID, promptID, versionNum)
	if err != nil {
		h.logger.Error("failed to get version", "org_id", orgID, "prompt_id", promptID, "version", versionNum, "error", err)
		if err.Error() == "prompt not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get version")
		return
	}
	if version == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "version not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, version)
}

// Deploy handles POST /v1/prompts/{id}/deploy/{version}.
func (h *VersionsHandler) Deploy(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	promptID := chi.URLParam(r, "id")
	if promptID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	versionStr := chi.URLParam(r, "version")
	versionNum, err := strconv.Atoi(versionStr)
	if err != nil || versionNum < 1 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "version must be a positive integer")
		return
	}

	if err := h.svc.Deploy(r.Context(), orgID, promptID, versionNum); err != nil {
		h.logger.Error("failed to deploy version", "org_id", orgID, "prompt_id", promptID, "version", versionNum, "error", err)
		errMsg := err.Error()
		if errMsg == "prompt not found" || errMsg == "version not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", errMsg)
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "DEPLOY_ERROR", "failed to deploy version")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message":          "version deployed successfully",
		"active_version":   versionNum,
	})
}

// Rollback handles POST /v1/prompts/{id}/rollback.
func (h *VersionsHandler) Rollback(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	promptID := chi.URLParam(r, "id")
	if promptID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "prompt id is required")
		return
	}

	updated, err := h.svc.Rollback(r.Context(), orgID, promptID)
	if err != nil {
		h.logger.Error("failed to rollback version", "org_id", orgID, "prompt_id", promptID, "error", err)
		errMsg := err.Error()
		if errMsg == "prompt not found" {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		if errMsg == "cannot rollback: already at version 1" {
			httputil.WriteError(w, http.StatusBadRequest, "ROLLBACK_ERROR", errMsg)
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "ROLLBACK_ERROR", "failed to rollback version")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"message":        "rollback successful",
		"active_version": updated.ActiveVersion,
		"prompt":         updated,
	})
}
