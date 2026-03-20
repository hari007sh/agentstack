package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	webhookservice "github.com/agentstack/agentstack/internal/webhook/service"
	"github.com/agentstack/agentstack/internal/webhook/store"
	"github.com/go-chi/chi/v5"
)

// DeliveryHandler handles webhook delivery log endpoints.
type DeliveryHandler struct {
	pg         *store.PostgresStore
	dispatcher *webhookservice.Dispatcher
	logger     *slog.Logger
}

// NewDeliveryHandler creates a new delivery handler.
func NewDeliveryHandler(pg *store.PostgresStore, dispatcher *webhookservice.Dispatcher, logger *slog.Logger) *DeliveryHandler {
	return &DeliveryHandler{pg: pg, dispatcher: dispatcher, logger: logger}
}

// List handles GET /v1/webhooks/{id}/deliveries.
func (h *DeliveryHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	endpointID := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 {
		limit = 50
	}

	page := 1
	if offset > 0 && limit > 0 {
		page = (offset / limit) + 1
	}

	deliveries, total, err := h.pg.ListDeliveries(r.Context(), orgID, endpointID, limit, offset)
	if err != nil {
		h.logger.Error("failed to list deliveries", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "LIST_ERROR", "failed to list deliveries")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": deliveries,
		"meta": map[string]interface{}{
			"page":     page,
			"per_page": limit,
			"total":    total,
		},
	})
}

// Retry handles POST /v1/webhooks/{id}/deliveries/{deliveryID}/retry.
func (h *DeliveryHandler) Retry(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	deliveryID := chi.URLParam(r, "deliveryID")

	if err := h.dispatcher.RetryDelivery(r.Context(), orgID, deliveryID); err != nil {
		h.logger.Error("failed to retry delivery", "delivery_id", deliveryID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "RETRY_ERROR", "failed to retry delivery")
		return
	}

	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"status":      "accepted",
		"delivery_id": deliveryID,
	})
}
