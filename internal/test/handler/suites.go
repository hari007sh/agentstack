// Package handler provides HTTP handlers for the Test module.
package handler

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/test/store"
	"github.com/go-chi/chi/v5"
)

// SuiteHandler handles test suite CRUD endpoints.
type SuiteHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewSuiteHandler creates a new suite handler.
func NewSuiteHandler(pg *store.PostgresStore, logger *slog.Logger) *SuiteHandler {
	return &SuiteHandler{pg: pg, logger: logger}
}

// createSuiteRequest is the request body for creating a test suite.
type createSuiteRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	AgentID     *string  `json:"agent_id,omitempty"`
	Tags        []string `json:"tags"`
}

// updateSuiteRequest is the request body for updating a test suite.
type updateSuiteRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	AgentID     *string  `json:"agent_id,omitempty"`
	Tags        []string `json:"tags"`
}

// List handles GET /v1/test/suites.
func (h *SuiteHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	suites, err := h.pg.ListTestSuites(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list test suites", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list test suites")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"suites": suites,
	})
}

// Get handles GET /v1/test/suites/{id}.
func (h *SuiteHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	suite, err := h.pg.GetTestSuite(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get test suite", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get test suite")
		return
	}
	if suite == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test suite not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, suite)
}

// Create handles POST /v1/test/suites.
func (h *SuiteHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createSuiteRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}

	if req.Tags == nil {
		req.Tags = []string{}
	}

	suite := &store.TestSuite{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		AgentID:     req.AgentID,
		Tags:        req.Tags,
	}

	if err := h.pg.CreateTestSuite(r.Context(), suite); err != nil {
		h.logger.Error("failed to create test suite", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create test suite")
		return
	}

	h.logger.Info("created test suite", "id", suite.ID, "name", suite.Name, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusCreated, suite)
}

// Update handles PUT /v1/test/suites/{id}.
func (h *SuiteHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	var req updateSuiteRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetTestSuite(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get test suite for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get test suite")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test suite not found")
		return
	}

	// Apply partial updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.AgentID != nil {
		existing.AgentID = req.AgentID
	}
	if req.Tags != nil {
		existing.Tags = req.Tags
	}

	if err := h.pg.UpdateTestSuite(r.Context(), existing); err != nil {
		h.logger.Error("failed to update test suite", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update test suite")
		return
	}

	h.logger.Info("updated test suite", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/test/suites/{id}.
func (h *SuiteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	if err := h.pg.DeleteTestSuite(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test suite not found")
			return
		}
		h.logger.Error("failed to delete test suite", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete test suite")
		return
	}

	h.logger.Info("deleted test suite", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

