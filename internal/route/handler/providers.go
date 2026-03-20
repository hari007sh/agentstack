// Package handler provides HTTP handlers for the Route module management API.
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/route/service"
	"github.com/agentstack/agentstack/internal/route/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// ProviderHandler handles provider CRUD endpoints.
type ProviderHandler struct {
	store  *store.Store
	encSvc *service.Encryption
	logger *slog.Logger
}

// NewProviderHandler creates a new ProviderHandler.
func NewProviderHandler(s *store.Store, encSvc *service.Encryption, logger *slog.Logger) *ProviderHandler {
	return &ProviderHandler{store: s, encSvc: encSvc, logger: logger}
}

// createProviderRequest is the JSON body for creating a provider.
type createProviderRequest struct {
	Name        string          `json:"name"`
	DisplayName string          `json:"display_name"`
	APIKey      string          `json:"api_key"`
	BaseURL     string          `json:"base_url"`
	IsEnabled   *bool           `json:"is_enabled"`
	Config      json.RawMessage `json:"config"`
}

// updateProviderRequest is the JSON body for updating a provider.
type updateProviderRequest struct {
	Name        *string          `json:"name"`
	DisplayName *string          `json:"display_name"`
	APIKey      *string          `json:"api_key"`
	BaseURL     *string          `json:"base_url"`
	IsEnabled   *bool            `json:"is_enabled"`
	Config      *json.RawMessage `json:"config"`
}

// providerResponse is the JSON response for a provider (never includes encrypted key).
type providerResponse struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	Name        string          `json:"name"`
	DisplayName string          `json:"display_name"`
	BaseURL     string          `json:"base_url"`
	IsEnabled   bool            `json:"is_enabled"`
	Config      json.RawMessage `json:"config"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

func toProviderResponse(p *store.Provider) *providerResponse {
	cfg := json.RawMessage(p.Config)
	if len(cfg) == 0 {
		cfg = json.RawMessage(`{}`)
	}
	return &providerResponse{
		ID:          p.ID,
		OrgID:       p.OrgID,
		Name:        p.Name,
		DisplayName: p.DisplayName,
		BaseURL:     p.BaseURL,
		IsEnabled:   p.IsEnabled,
		Config:      cfg,
		CreatedAt:   p.CreatedAt.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:   p.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

// List handles GET /v1/gateway/providers.
func (h *ProviderHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	providers, err := h.store.ListProviders(r.Context(), orgID)
	if err != nil {
		h.logger.Error("list providers", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to list providers")
		return
	}

	resp := make([]*providerResponse, 0, len(providers))
	for i := range providers {
		resp = append(resp, toProviderResponse(&providers[i]))
	}
	httputil.WriteJSON(w, http.StatusOK, resp)
}

// Create handles POST /v1/gateway/providers.
func (h *ProviderHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization")
		return
	}

	var req createProviderRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.APIKey == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "api_key is required")
		return
	}

	// Encrypt the API key
	ciphertext, nonce, err := h.encSvc.Encrypt(req.APIKey)
	if err != nil {
		h.logger.Error("encrypt api key", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "ENCRYPTION_ERROR", "failed to encrypt API key")
		return
	}

	isEnabled := true
	if req.IsEnabled != nil {
		isEnabled = *req.IsEnabled
	}

	cfgStr := "{}"
	if len(req.Config) > 0 {
		cfgStr = string(req.Config)
	}

	p := &store.Provider{
		OrgID:           orgID,
		Name:            req.Name,
		DisplayName:     req.DisplayName,
		APIKeyEncrypted: ciphertext,
		APIKeyNonce:     nonce,
		BaseURL:         req.BaseURL,
		IsEnabled:       isEnabled,
		Config:          cfgStr,
	}

	id, err := h.store.CreateProvider(r.Context(), p)
	if err != nil {
		h.logger.Error("create provider", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create provider")
		return
	}

	created, err := h.store.GetProvider(r.Context(), orgID, id)
	if err != nil || created == nil {
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id})
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, toProviderResponse(created))
}

// Get handles GET /v1/gateway/providers/{id}.
func (h *ProviderHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	p, err := h.store.GetProvider(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get provider", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get provider")
		return
	}
	if p == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "provider not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, toProviderResponse(p))
}

// Update handles PUT /v1/gateway/providers/{id}.
func (h *ProviderHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetProviderWithKey(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get provider for update", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get provider")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "provider not found")
		return
	}

	var req updateProviderRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.DisplayName != nil {
		existing.DisplayName = *req.DisplayName
	}
	if req.BaseURL != nil {
		existing.BaseURL = *req.BaseURL
	}
	if req.IsEnabled != nil {
		existing.IsEnabled = *req.IsEnabled
	}
	if req.Config != nil {
		existing.Config = string(*req.Config)
	}

	// Re-encrypt API key if provided
	if req.APIKey != nil && *req.APIKey != "" {
		ciphertext, nonce, err := h.encSvc.Encrypt(*req.APIKey)
		if err != nil {
			h.logger.Error("encrypt api key on update", "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "ENCRYPTION_ERROR", "failed to encrypt API key")
			return
		}
		existing.APIKeyEncrypted = ciphertext
		existing.APIKeyNonce = nonce
	}

	if err := h.store.UpdateProvider(r.Context(), existing); err != nil {
		h.logger.Error("update provider", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to update provider")
		return
	}

	updated, _ := h.store.GetProvider(r.Context(), orgID, id)
	if updated != nil {
		httputil.WriteJSON(w, http.StatusOK, toProviderResponse(updated))
	} else {
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "updated"})
	}
}

// Delete handles DELETE /v1/gateway/providers/{id}.
func (h *ProviderHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	id := chi.URLParam(r, "id")

	existing, err := h.store.GetProvider(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("get provider for delete", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to get provider")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "provider not found")
		return
	}

	if err := h.store.DeleteProvider(r.Context(), orgID, id); err != nil {
		h.logger.Error("delete provider", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete provider")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
