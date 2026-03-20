// Package handler provides HTTP handlers for the Dataset module.
package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/agentstack/agentstack/internal/dataset/service"
	"github.com/agentstack/agentstack/internal/dataset/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// DatasetHandler handles dataset CRUD endpoints.
type DatasetHandler struct {
	svc    *service.DatasetService
	logger *slog.Logger
}

// NewDatasetHandler creates a new dataset handler.
func NewDatasetHandler(svc *service.DatasetService, logger *slog.Logger) *DatasetHandler {
	return &DatasetHandler{svc: svc, logger: logger}
}

// createDatasetRequest is the request body for creating a dataset.
type createDatasetRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
	Tags        []string        `json:"tags"`
	Source      string          `json:"source"`
}

// updateDatasetRequest is the request body for updating a dataset.
type updateDatasetRequest struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	Schema      *json.RawMessage `json:"schema"`
	Tags        *[]string        `json:"tags"`
}

// Create handles POST /v1/datasets.
func (h *DatasetHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createDatasetRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}

	dataset := &store.Dataset{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Schema:      req.Schema,
		Tags:        req.Tags,
		Source:      req.Source,
	}

	if err := h.svc.CreateDataset(r.Context(), dataset); err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			httputil.WriteError(w, http.StatusConflict, "CONFLICT", "a dataset with this name already exists")
			return
		}
		h.logger.Error("failed to create dataset", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create dataset")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": dataset})
}

// List handles GET /v1/datasets.
func (h *DatasetHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	page := 1
	if offset > 0 && limit > 0 {
		page = (offset / limit) + 1
	}

	datasets, total, err := h.svc.ListDatasets(r.Context(), orgID, limit, offset)
	if err != nil {
		h.logger.Error("failed to list datasets", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "LIST_ERROR", "failed to list datasets")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": datasets,
		"meta": map[string]interface{}{
			"page":     page,
			"per_page": limit,
			"total":    total,
		},
	})
}

// Get handles GET /v1/datasets/{id}.
func (h *DatasetHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	dataset, err := h.svc.GetDataset(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get dataset", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get dataset")
		return
	}
	if dataset == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "dataset not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": dataset})
}

// Update handles PATCH /v1/datasets/{id}.
func (h *DatasetHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")

	existing, err := h.svc.GetDataset(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get dataset for update", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get dataset")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "dataset not found")
		return
	}

	var req updateDatasetRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.Tags != nil {
		existing.Tags = *req.Tags
	}
	if req.Schema != nil {
		existing.Schema = *req.Schema
	}

	if err := h.svc.UpdateDataset(r.Context(), existing); err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			httputil.WriteError(w, http.StatusConflict, "CONFLICT", "a dataset with this name already exists")
			return
		}
		h.logger.Error("failed to update dataset", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update dataset")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": existing})
}

// Delete handles DELETE /v1/datasets/{id}.
func (h *DatasetHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteDataset(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "dataset not found")
			return
		}
		h.logger.Error("failed to delete dataset", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete dataset")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// LinkSuite handles POST /v1/datasets/{id}/link/{suiteID}.
func (h *DatasetHandler) LinkSuite(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")
	suiteID := chi.URLParam(r, "suiteID")

	link, err := h.svc.LinkSuite(r.Context(), orgID, datasetID, suiteID)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			httputil.WriteError(w, http.StatusConflict, "CONFLICT", "dataset is already linked to this suite")
			return
		}
		h.logger.Error("failed to link suite", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "LINK_ERROR", "failed to link dataset to suite")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": link})
}

// UnlinkSuite handles DELETE /v1/datasets/{id}/link/{suiteID}.
func (h *DatasetHandler) UnlinkSuite(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")
	suiteID := chi.URLParam(r, "suiteID")

	if err := h.svc.UnlinkSuite(r.Context(), orgID, datasetID, suiteID); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "link not found")
			return
		}
		h.logger.Error("failed to unlink suite", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UNLINK_ERROR", "failed to unlink dataset from suite")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// FromSession handles POST /v1/datasets/from-session/{sessionID}.
// This is a placeholder that captures session data as a dataset item.
func (h *DatasetHandler) FromSession(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	sessionID := chi.URLParam(r, "sessionID")

	var req struct {
		DatasetID      string `json:"dataset_id"`
		IncludeInput   bool   `json:"include_input"`
		IncludeOutput  bool   `json:"include_output"`
		IncludeContext bool   `json:"include_context"`
		Label          string `json:"label"`
	}
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.DatasetID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "dataset_id is required")
		return
	}

	// Verify dataset exists
	dataset, err := h.svc.GetDataset(r.Context(), orgID, req.DatasetID)
	if err != nil {
		h.logger.Error("failed to get dataset for session capture", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get dataset")
		return
	}
	if dataset == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "dataset not found")
		return
	}

	// Build a dataset item from the session reference.
	// In a full implementation, this would read from the Trace module's ClickHouse store.
	// Here we create a placeholder item with the session metadata.
	data := map[string]interface{}{
		"source_session_id": sessionID,
		"label":             req.Label,
	}
	dataJSON, _ := json.Marshal(data)

	meta := map[string]interface{}{
		"source":            "production",
		"source_session_id": sessionID,
		"include_input":     req.IncludeInput,
		"include_output":    req.IncludeOutput,
		"include_context":   req.IncludeContext,
	}
	metaJSON, _ := json.Marshal(meta)

	item := &store.DatasetItem{
		DatasetID: req.DatasetID,
		OrgID:     orgID,
		Data:      dataJSON,
		Metadata:  metaJSON,
	}

	if err := h.svc.AddItem(r.Context(), item); err != nil {
		h.logger.Error("failed to create item from session", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create dataset item from session")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": item})
}
