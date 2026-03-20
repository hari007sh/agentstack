package handler

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/service"
	"github.com/go-chi/chi/v5"
)

// AlertHandler handles alert rule CRUD endpoints.
type AlertHandler struct {
	svc    *service.AlertService
	logger *slog.Logger
}

// NewAlertHandler creates a new alert handler.
func NewAlertHandler(svc *service.AlertService, logger *slog.Logger) *AlertHandler {
	return &AlertHandler{svc: svc, logger: logger}
}

// List handles GET /v1/alerts.
func (h *AlertHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	rules, err := h.svc.ListAlertRules(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list alert rules", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list alert rules")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"alert_rules": rules,
	})
}

// Get handles GET /v1/alerts/{id}.
func (h *AlertHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "alert rule ID is required")
		return
	}

	rule, err := h.svc.GetAlertRule(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get alert rule", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get alert rule")
		return
	}
	if rule == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "alert rule not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, rule)
}

// Create handles POST /v1/alerts.
func (h *AlertHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req service.CreateAlertRuleRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.ConditionType == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "condition_type is required")
		return
	}
	if !isValidConditionType(req.ConditionType) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid condition_type: must be one of threshold, pattern, anomaly")
		return
	}

	rule, err := h.svc.CreateAlertRule(r.Context(), orgID, &req)
	if err != nil {
		h.logger.Error("failed to create alert rule", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create alert rule")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, rule)
}

// Update handles PUT /v1/alerts/{id}.
func (h *AlertHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "alert rule ID is required")
		return
	}

	var req service.UpdateAlertRuleRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.ConditionType != "" && !isValidConditionType(req.ConditionType) {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
			"invalid condition_type: must be one of threshold, pattern, anomaly")
		return
	}

	rule, err := h.svc.UpdateAlertRule(r.Context(), orgID, id, &req)
	if err != nil {
		h.logger.Error("failed to update alert rule", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update alert rule")
		return
	}
	if rule == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "alert rule not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, rule)
}

// Delete handles DELETE /v1/alerts/{id}.
func (h *AlertHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "alert rule ID is required")
		return
	}

	if err := h.svc.DeleteAlertRule(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "alert rule not found")
			return
		}
		h.logger.Error("failed to delete alert rule", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete alert rule")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}

// --- Validation ---

var validConditionTypes = map[string]bool{
	"threshold": true,
	"pattern":   true,
	"anomaly":   true,
}

func isValidConditionType(t string) bool {
	return validConditionTypes[t]
}
