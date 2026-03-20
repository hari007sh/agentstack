package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/dataset/service"
	"github.com/agentstack/agentstack/internal/dataset/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// ItemHandler handles dataset item endpoints.
type ItemHandler struct {
	svc      *service.DatasetService
	importer *service.Importer
	exporter *service.Exporter
	logger   *slog.Logger
}

// NewItemHandler creates a new item handler.
func NewItemHandler(svc *service.DatasetService, importer *service.Importer, exporter *service.Exporter, logger *slog.Logger) *ItemHandler {
	return &ItemHandler{
		svc:      svc,
		importer: importer,
		exporter: exporter,
		logger:   logger,
	}
}

// createItemRequest is the request body for creating a single item.
type createItemRequest struct {
	Data     json.RawMessage `json:"data"`
	Metadata json.RawMessage `json:"metadata"`
}

// createBatchRequest is the request body for batch creating items.
type createBatchRequest struct {
	Items []createItemRequest `json:"items"`
}

// Create handles POST /v1/datasets/{id}/items.
func (h *ItemHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")

	var req createItemRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if len(req.Data) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "data is required")
		return
	}

	item := &store.DatasetItem{
		DatasetID: datasetID,
		OrgID:     orgID,
		Data:      req.Data,
		Metadata:  req.Metadata,
	}

	if err := h.svc.AddItem(r.Context(), item); err != nil {
		h.logger.Error("failed to create item", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create item")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": item})
}

// CreateBatch handles POST /v1/datasets/{id}/items/batch.
func (h *ItemHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")

	var req createBatchRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if len(req.Items) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "items array is required and must not be empty")
		return
	}
	if len(req.Items) > 1000 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "batch size exceeds maximum of 1000 items")
		return
	}

	items := make([]store.DatasetItem, len(req.Items))
	for i, ri := range req.Items {
		if len(ri.Data) == 0 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "data is required for each item")
			return
		}
		items[i] = store.DatasetItem{
			DatasetID: datasetID,
			OrgID:     orgID,
			Data:      ri.Data,
			Metadata:  ri.Metadata,
		}
	}

	count, err := h.svc.AddItemsBatch(r.Context(), orgID, datasetID, items)
	if err != nil {
		h.logger.Error("failed to create items batch", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create items batch")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{
		"status":     "created",
		"item_count": count,
	})
}

// List handles GET /v1/datasets/{id}/items.
func (h *ItemHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	page := 1
	if offset > 0 && limit > 0 {
		page = (offset / limit) + 1
	}

	items, total, err := h.svc.ListItems(r.Context(), orgID, datasetID, limit, offset)
	if err != nil {
		h.logger.Error("failed to list items", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "LIST_ERROR", "failed to list items")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": items,
		"meta": map[string]interface{}{
			"page":     page,
			"per_page": limit,
			"total":    total,
		},
	})
}

// Get handles GET /v1/datasets/{id}/items/{itemID}.
func (h *ItemHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")
	itemID := chi.URLParam(r, "itemID")

	item, err := h.svc.GetItem(r.Context(), orgID, datasetID, itemID)
	if err != nil {
		h.logger.Error("failed to get item", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get item")
		return
	}
	if item == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "item not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": item})
}

// Delete handles DELETE /v1/datasets/{id}/items/{itemID}.
func (h *ItemHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")
	itemID := chi.URLParam(r, "itemID")

	if err := h.svc.DeleteItem(r.Context(), orgID, datasetID, itemID); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "item not found")
			return
		}
		h.logger.Error("failed to delete item", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete item")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Import handles POST /v1/datasets/{id}/import.
func (h *ItemHandler) Import(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")

	// Limit request body to 10MB
	r.Body = http.MaxBytesReader(w, r.Body, 10*1024*1024)

	if err := r.ParseMultipartForm(10 * 1024 * 1024); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "failed to parse multipart form (max 10MB)")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "MISSING_FILE", "file is required")
		return
	}
	defer file.Close()

	format := r.FormValue("format")
	if format == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "format is required (csv, json, or jsonl)")
		return
	}

	var count int
	switch format {
	case "csv":
		var mapping map[string]string
		mappingStr := r.FormValue("column_mapping")
		if mappingStr != "" {
			if err := json.Unmarshal([]byte(mappingStr), &mapping); err != nil {
				httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid column_mapping JSON")
				return
			}
		}
		count, err = h.importer.ImportCSV(r.Context(), orgID, datasetID, file, mapping)
	case "json":
		count, err = h.importer.ImportJSON(r.Context(), orgID, datasetID, file)
	case "jsonl":
		count, err = h.importer.ImportJSONL(r.Context(), orgID, datasetID, file)
	default:
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "format must be csv, json, or jsonl")
		return
	}

	if err != nil {
		h.logger.Error("import failed", "format", format, "error", err)
		httputil.WriteError(w, http.StatusBadRequest, "IMPORT_ERROR", err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":         "imported",
		"items_imported": count,
		"format":         format,
	})
}

// Export handles GET /v1/datasets/{id}/export.
func (h *ItemHandler) Export(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	datasetID := chi.URLParam(r, "id")

	result, err := h.exporter.ExportJSON(r.Context(), orgID, datasetID)
	if err != nil {
		h.logger.Error("export failed", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "EXPORT_ERROR", "failed to export dataset")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": result})
}
