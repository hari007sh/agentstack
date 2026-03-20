package handler

import (
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// RouteHandler handles routing rules CRUD endpoints.
type RouteHandler struct {
	store  *store.Store
	logger *slog.Logger
}

// NewRouteHandler creates a new RouteHandler.
func NewRouteHandler(s *store.Store, logger *slog.Logger) *RouteHandler {
	return &RouteHandler{store: s, logger: logger}
}

// createRouteRequest is the JSON body for creating a route.
type createRouteRequest struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	ModelPattern string  `json:"model_pattern"`
	Strategy     string  `json:"strategy"`
	ProviderID   string  `json:"provider_id"`
	TargetModel  string  `json:"target_model"`
	Priority     int     `json:"priority"`
	Weight       float64 `json:"weight"`
	Enabled      *bool   `json:"enabled"`
}

// updateRouteRequest is the JSON body for updating a route.
type updateRouteRequest struct {
	Name         *string  `json:"name"`
	Description  *string  `json:"description"`
	ModelPattern *string  `json:"model_pattern"`
	Strategy     *string  `json:"strategy"`
	ProviderID   *string  `json:"provider_id"`
	TargetModel  *string  `json:"target_model"`
	Priority     *int     `json:"priority"`
	Weight       *float64 `json:"weight"`
	Enabled      *bool    `json:"enabled"`
}

// List handles GET /v1/gateway/routes.
func (h *RouteHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	routes, err := h.store.ListRoutes(r.Context(), orgID)
	if err != nil {
		h.logger.Error("list routes", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to list routes")
		return
	}

	if routes == nil {
		routes = []store.Route{}
	}
	httputil.WriteJSON(w, http.StatusOK, routes)
}

// Create handles POST /v1/gateway/routes.
func (h *RouteHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	var req createRouteRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.ProviderID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "provider_id is required")
		return
	}
	if req.TargetModel == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "target_model is required")
		return
	}

	strategy := req.Strategy
	if strategy == "" {
		strategy = "priority"
	}
	modelPattern := req.ModelPattern
	if modelPattern == "" {
		modelPattern = "*"
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	weight := req.Weight
	if weight == 0 {
		weight = 1.0
	}

	rt := &store.Route{
		OrgID:        orgID,
		Name:         req.Name,
		Description:  req.Description,
		ModelPattern: modelPattern,
		Strategy:     strategy,
		ProviderID:   req.ProviderID,
		TargetModel:  req.TargetModel,
		Priority:     req.Priority,
		Weight:       weight,
		Enabled:      enabled,
	}

	id, err := h.store.CreateRoute(r.Context(), rt)
	if err != nil {
		h.logger.Error("create route", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create route")
		return
	}

	created, err := h.store.GetRoute(r.Context(), orgID, id)
	if err != nil || created == nil {
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, created)
}

// Update handles PUT /v1/gateway/routes/{id}.
func (h *RouteHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetRoute(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get route for update", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get route")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "route not found")
		return
	}

	var req updateRouteRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Description != nil {
		existing.Description = *req.Description
	}
	if req.ModelPattern != nil {
		existing.ModelPattern = *req.ModelPattern
	}
	if req.Strategy != nil {
		existing.Strategy = *req.Strategy
	}
	if req.ProviderID != nil {
		existing.ProviderID = *req.ProviderID
	}
	if req.TargetModel != nil {
		existing.TargetModel = *req.TargetModel
	}
	if req.Priority != nil {
		existing.Priority = *req.Priority
	}
	if req.Weight != nil {
		existing.Weight = *req.Weight
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := h.store.UpdateRoute(r.Context(), existing); err != nil {
		h.logger.Error("update route", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to update route")
		return
	}

	updated, _ := h.store.GetRoute(r.Context(), orgID, id)
	if updated != nil {
		httputil.WriteJSON(w, http.StatusOK, updated)
	} else {
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

// Delete handles DELETE /v1/gateway/routes/{id}.
func (h *RouteHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetRoute(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get route for delete", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get route")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "route not found")
		return
	}

	if err := h.store.DeleteRoute(r.Context(), orgID, id); err != nil {
		h.logger.Error("delete route", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete route")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
