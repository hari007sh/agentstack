package handler

import (
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// FallbackHandler handles fallback chain CRUD endpoints.
type FallbackHandler struct {
	store  *store.Store
	logger *slog.Logger
}

// NewFallbackHandler creates a new FallbackHandler.
func NewFallbackHandler(s *store.Store, logger *slog.Logger) *FallbackHandler {
	return &FallbackHandler{store: s, logger: logger}
}

// createFallbackRequest is the JSON body for creating a fallback chain.
type createFallbackRequest struct {
	Name         string                    `json:"name"`
	ModelPattern string                    `json:"model_pattern"`
	Chain        []store.FallbackChainEntry `json:"chain"`
	Enabled      *bool                     `json:"enabled"`
}

// updateFallbackRequest is the JSON body for updating a fallback chain.
type updateFallbackRequest struct {
	Name         *string                    `json:"name"`
	ModelPattern *string                    `json:"model_pattern"`
	Chain        *[]store.FallbackChainEntry `json:"chain"`
	Enabled      *bool                      `json:"enabled"`
}

// List handles GET /v1/gateway/fallbacks.
func (h *FallbackHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	chains, err := h.store.ListFallbackChains(r.Context(), orgID)
	if err != nil {
		h.logger.Error("list fallback chains", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to list fallback chains")
		return
	}

	if chains == nil {
		chains = []store.FallbackChain{}
	}
	httputil.WriteJSON(w, http.StatusOK, chains)
}

// Create handles POST /v1/gateway/fallbacks.
func (h *FallbackHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	var req createFallbackRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if len(req.Chain) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "chain must have at least one entry")
		return
	}

	modelPattern := req.ModelPattern
	if modelPattern == "" {
		modelPattern = "*"
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	fc := &store.FallbackChain{
		OrgID:        orgID,
		Name:         req.Name,
		ModelPattern: modelPattern,
		Chain:        req.Chain,
		Enabled:      enabled,
	}

	id, err := h.store.CreateFallbackChain(r.Context(), fc)
	if err != nil {
		h.logger.Error("create fallback chain", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create fallback chain")
		return
	}

	created, err := h.store.GetFallbackChain(r.Context(), orgID, id)
	if err != nil || created == nil {
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, created)
}

// Get handles GET /v1/gateway/fallbacks/{id}.
func (h *FallbackHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	fc, err := h.store.GetFallbackChain(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get fallback chain", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get fallback chain")
		return
	}
	if fc == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "fallback chain not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, fc)
}

// Update handles PUT /v1/gateway/fallbacks/{id}.
func (h *FallbackHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetFallbackChain(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get fallback chain for update", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get fallback chain")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "fallback chain not found")
		return
	}

	var req updateFallbackRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.ModelPattern != nil {
		existing.ModelPattern = *req.ModelPattern
	}
	if req.Chain != nil {
		existing.Chain = *req.Chain
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := h.store.UpdateFallbackChain(r.Context(), existing); err != nil {
		h.logger.Error("update fallback chain", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to update fallback chain")
		return
	}

	updated, _ := h.store.GetFallbackChain(r.Context(), orgID, id)
	if updated != nil {
		httputil.WriteJSON(w, http.StatusOK, updated)
	} else {
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

// Delete handles DELETE /v1/gateway/fallbacks/{id}.
func (h *FallbackHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetFallbackChain(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get fallback chain for delete", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get fallback chain")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "fallback chain not found")
		return
	}

	if err := h.store.DeleteFallbackChain(r.Context(), orgID, id); err != nil {
		h.logger.Error("delete fallback chain", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete fallback chain")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
