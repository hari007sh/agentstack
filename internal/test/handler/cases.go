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

// CaseHandler handles test case CRUD endpoints.
type CaseHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewCaseHandler creates a new case handler.
func NewCaseHandler(pg *store.PostgresStore, logger *slog.Logger) *CaseHandler {
	return &CaseHandler{pg: pg, logger: logger}
}

// createCaseRequest is the request body for creating a test case.
type createCaseRequest struct {
	Name               string          `json:"name"`
	Description        string          `json:"description"`
	Input              json.RawMessage `json:"input"`
	ExpectedOutput     json.RawMessage `json:"expected_output,omitempty"`
	Context            json.RawMessage `json:"context,omitempty"`
	EvaluatorIDs       []string        `json:"evaluator_ids"`
	Tags               []string        `json:"tags"`
	CreatedFromSession *string         `json:"created_from_session,omitempty"`
}

// updateCaseRequest is the request body for updating a test case.
type updateCaseRequest struct {
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Input          json.RawMessage `json:"input,omitempty"`
	ExpectedOutput json.RawMessage `json:"expected_output,omitempty"`
	Context        json.RawMessage `json:"context,omitempty"`
	EvaluatorIDs   []string        `json:"evaluator_ids,omitempty"`
	Tags           []string        `json:"tags,omitempty"`
}

// List handles GET /v1/test/suites/{suiteId}/cases.
func (h *CaseHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	suiteID := chi.URLParam(r, "suiteId")
	if suiteID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	cases, err := h.pg.ListTestCases(r.Context(), orgID, suiteID)
	if err != nil {
		h.logger.Error("failed to list test cases", "suite_id", suiteID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list test cases")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"cases": cases,
	})
}

// Get handles GET /v1/test/cases/{id}.
func (h *CaseHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "case ID is required")
		return
	}

	tc, err := h.pg.GetTestCase(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get test case", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get test case")
		return
	}
	if tc == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test case not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, tc)
}

// Create handles POST /v1/test/suites/{suiteId}/cases.
func (h *CaseHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	suiteID := chi.URLParam(r, "suiteId")
	if suiteID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	var req createCaseRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.Input == nil {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "input is required")
		return
	}

	if req.Context == nil {
		req.Context = json.RawMessage("{}")
	}
	if req.EvaluatorIDs == nil {
		req.EvaluatorIDs = []string{}
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	tc := &store.TestCase{
		SuiteID:            suiteID,
		OrgID:              orgID,
		Name:               req.Name,
		Description:        req.Description,
		Input:              req.Input,
		ExpectedOutput:     req.ExpectedOutput,
		Context:            req.Context,
		EvaluatorIDs:       req.EvaluatorIDs,
		Tags:               req.Tags,
		CreatedFromSession: req.CreatedFromSession,
	}

	if err := h.pg.CreateTestCase(r.Context(), tc); err != nil {
		h.logger.Error("failed to create test case", "suite_id", suiteID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create test case")
		return
	}

	h.logger.Info("created test case", "id", tc.ID, "name", tc.Name, "suite_id", suiteID)
	httputil.WriteJSON(w, http.StatusCreated, tc)
}

// Update handles PUT /v1/test/cases/{id}.
func (h *CaseHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "case ID is required")
		return
	}

	var req updateCaseRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetTestCase(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get test case for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get test case")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test case not found")
		return
	}

	// Apply partial updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Input != nil {
		existing.Input = req.Input
	}
	if req.ExpectedOutput != nil {
		existing.ExpectedOutput = req.ExpectedOutput
	}
	if req.Context != nil {
		existing.Context = req.Context
	}
	if req.EvaluatorIDs != nil {
		existing.EvaluatorIDs = req.EvaluatorIDs
	}
	if req.Tags != nil {
		existing.Tags = req.Tags
	}

	if err := h.pg.UpdateTestCase(r.Context(), existing); err != nil {
		h.logger.Error("failed to update test case", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update test case")
		return
	}

	h.logger.Info("updated test case", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/test/cases/{id}.
func (h *CaseHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "case ID is required")
		return
	}

	if err := h.pg.DeleteTestCase(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test case not found")
			return
		}
		h.logger.Error("failed to delete test case", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete test case")
		return
	}

	h.logger.Info("deleted test case", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}
