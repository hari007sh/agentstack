// Package handler provides HTTP handlers for the Webhook module.
package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	webhookservice "github.com/agentstack/agentstack/internal/webhook/service"
	"github.com/agentstack/agentstack/internal/webhook/store"
	"github.com/go-chi/chi/v5"
)

// WebhookHandler handles webhook endpoint CRUD.
type WebhookHandler struct {
	pg         *store.PostgresStore
	dispatcher *webhookservice.Dispatcher
	logger     *slog.Logger
}

// NewWebhookHandler creates a new webhook handler.
func NewWebhookHandler(pg *store.PostgresStore, dispatcher *webhookservice.Dispatcher, logger *slog.Logger) *WebhookHandler {
	return &WebhookHandler{pg: pg, dispatcher: dispatcher, logger: logger}
}

// validWebhookTypes lists the allowed webhook types.
var validWebhookTypes = map[string]bool{
	"generic":   true,
	"slack":     true,
	"pagerduty": true,
}

// validEvents lists the allowed webhook event types.
var validEvents = map[string]bool{
	"alert.fired":          true,
	"alert.resolved":       true,
	"shield.healing":       true,
	"shield.circuit_break": true,
	"guard.blocked":        true,
	"guard.flagged":        true,
	"cost.budget_warning":  true,
	"cost.budget_exceeded": true,
	"test.run_completed":   true,
	"test.run_failed":      true,
	"session.failed":       true,
}

// createWebhookRequest is the request body for creating a webhook.
type createWebhookRequest struct {
	Name    string          `json:"name"`
	Type    string          `json:"type"`
	URL     string          `json:"url"`
	Secret  string          `json:"secret"`
	Events  []string        `json:"events"`
	Headers json.RawMessage `json:"headers"`
}

// updateWebhookRequest is the request body for updating a webhook.
type updateWebhookRequest struct {
	Name     *string          `json:"name"`
	Type     *string          `json:"type"`
	URL      *string          `json:"url"`
	Secret   *string          `json:"secret"`
	Events   *[]string        `json:"events"`
	Headers  *json.RawMessage `json:"headers"`
	IsActive *bool            `json:"is_active"`
}

// Create handles POST /v1/webhooks.
func (h *WebhookHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createWebhookRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.URL == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "url is required")
		return
	}
	if req.Type == "" {
		req.Type = "generic"
	}
	if !validWebhookTypes[req.Type] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "type must be generic, slack, or pagerduty")
		return
	}
	if len(req.Events) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "at least one event is required")
		return
	}
	for _, evt := range req.Events {
		if !validEvents[evt] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid event type: "+evt)
			return
		}
	}

	ep := &store.WebhookEndpoint{
		OrgID:    orgID,
		Name:     req.Name,
		Type:     req.Type,
		URL:      req.URL,
		Secret:   req.Secret,
		Events:   req.Events,
		Headers:  req.Headers,
		IsActive: true,
	}

	if err := h.pg.CreateEndpoint(r.Context(), ep); err != nil {
		h.logger.Error("failed to create webhook", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create webhook endpoint")
		return
	}

	// Don't return secret in response
	ep.Secret = ""
	httputil.WriteJSON(w, http.StatusCreated, map[string]interface{}{"data": ep})
}

// List handles GET /v1/webhooks.
func (h *WebhookHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	endpoints, err := h.pg.ListEndpoints(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list webhooks", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "LIST_ERROR", "failed to list webhooks")
		return
	}

	// Mask secrets
	for i := range endpoints {
		if endpoints[i].Secret != "" {
			endpoints[i].Secret = "••••••••"
		}
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": endpoints})
}

// Get handles GET /v1/webhooks/{id}.
func (h *WebhookHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	ep, err := h.pg.GetEndpoint(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get webhook", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get webhook")
		return
	}
	if ep == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "webhook not found")
		return
	}

	if ep.Secret != "" {
		ep.Secret = "••••••••"
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": ep})
}

// Update handles PATCH /v1/webhooks/{id}.
func (h *WebhookHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	existing, err := h.pg.GetEndpoint(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get webhook for update", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get webhook")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "webhook not found")
		return
	}

	var req updateWebhookRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name != nil {
		existing.Name = *req.Name
	}
	if req.Type != nil {
		if !validWebhookTypes[*req.Type] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "type must be generic, slack, or pagerduty")
			return
		}
		existing.Type = *req.Type
	}
	if req.URL != nil {
		existing.URL = *req.URL
	}
	if req.Secret != nil {
		existing.Secret = *req.Secret
	}
	if req.Events != nil {
		for _, evt := range *req.Events {
			if !validEvents[evt] {
				httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid event type: "+evt)
				return
			}
		}
		existing.Events = *req.Events
	}
	if req.Headers != nil {
		existing.Headers = *req.Headers
	}
	if req.IsActive != nil {
		existing.IsActive = *req.IsActive
	}

	if err := h.pg.UpdateEndpoint(r.Context(), existing); err != nil {
		h.logger.Error("failed to update webhook", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update webhook")
		return
	}

	if existing.Secret != "" {
		existing.Secret = "••••••••"
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"data": existing})
}

// Delete handles DELETE /v1/webhooks/{id}.
func (h *WebhookHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.pg.DeleteEndpoint(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "webhook not found")
			return
		}
		h.logger.Error("failed to delete webhook", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete webhook")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Test handles POST /v1/webhooks/{id}/test.
func (h *WebhookHandler) Test(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	ep, err := h.pg.GetEndpoint(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get webhook for test", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "GET_ERROR", "failed to get webhook")
		return
	}
	if ep == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "webhook not found")
		return
	}

	delivery, err := h.dispatcher.SendTestDelivery(r.Context(), ep)
	if err != nil {
		if strings.Contains(err.Error(), "request failed") {
			httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
				"status":  "failed",
				"message": err.Error(),
			})
			return
		}
		h.logger.Error("failed to send test webhook", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "TEST_ERROR", "failed to send test webhook")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": delivery,
	})
}
