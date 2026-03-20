package handler

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/cost/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// BudgetsHandler handles budget policy CRUD endpoints.
type BudgetsHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewBudgetsHandler creates a new budgets handler.
func NewBudgetsHandler(pg *store.PostgresStore, logger *slog.Logger) *BudgetsHandler {
	return &BudgetsHandler{pg: pg, logger: logger}
}

// createBudgetRequest is the request body for creating a budget.
type createBudgetRequest struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Scope             string `json:"scope"`
	ScopeValue        string `json:"scope_value"`
	LimitCents        int    `json:"limit_cents"`
	Period            string `json:"period"`
	Action            string `json:"action"`
	AlertThresholdPct *int   `json:"alert_threshold_pct,omitempty"`
	Enabled           *bool  `json:"enabled,omitempty"`
}

// updateBudgetRequest is the request body for updating a budget.
type updateBudgetRequest struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	Scope             string `json:"scope"`
	ScopeValue        string `json:"scope_value"`
	LimitCents        *int   `json:"limit_cents,omitempty"`
	Period            string `json:"period"`
	Action            string `json:"action"`
	AlertThresholdPct *int   `json:"alert_threshold_pct,omitempty"`
	Enabled           *bool  `json:"enabled,omitempty"`
}

var validScopes = map[string]bool{
	"org":   true,
	"agent": true,
	"model": true,
}

var validPeriods = map[string]bool{
	"daily":   true,
	"weekly":  true,
	"monthly": true,
}

var validActions = map[string]bool{
	"alert":    true,
	"throttle": true,
	"block":    true,
}

// List handles GET /v1/cost/budgets.
func (h *BudgetsHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	budgets, err := h.pg.ListBudgets(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list budgets", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list budgets")
		return
	}

	// Add utilization percentage to each budget
	type budgetWithUtil struct {
		store.Budget
		UtilizationPct int `json:"utilization_pct"`
	}

	result := make([]budgetWithUtil, 0, len(budgets))
	for _, b := range budgets {
		util := 0
		if b.LimitCents > 0 {
			util = (b.CurrentSpendCents * 100) / b.LimitCents
		}
		result = append(result, budgetWithUtil{Budget: b, UtilizationPct: util})
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"budgets": result,
	})
}

// Create handles POST /v1/cost/budgets.
func (h *BudgetsHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createBudgetRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}
	if req.LimitCents <= 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "limit_cents must be a positive integer")
		return
	}

	// Defaults
	if req.Scope == "" {
		req.Scope = "org"
	}
	if !validScopes[req.Scope] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid scope; must be one of: org, agent, model")
		return
	}
	if req.Period == "" {
		req.Period = "monthly"
	}
	if !validPeriods[req.Period] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid period; must be one of: daily, weekly, monthly")
		return
	}
	if req.Action == "" {
		req.Action = "alert"
	}
	if !validActions[req.Action] {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid action; must be one of: alert, throttle, block")
		return
	}

	alertPct := 80
	if req.AlertThresholdPct != nil {
		alertPct = *req.AlertThresholdPct
		if alertPct < 1 || alertPct > 100 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "alert_threshold_pct must be between 1 and 100")
			return
		}
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	budget := &store.Budget{
		OrgID:             orgID,
		Name:              req.Name,
		Description:       req.Description,
		Scope:             req.Scope,
		ScopeValue:        req.ScopeValue,
		LimitCents:        req.LimitCents,
		Period:            req.Period,
		Action:            req.Action,
		AlertThresholdPct: alertPct,
		Enabled:           enabled,
	}

	if err := h.pg.CreateBudget(r.Context(), budget); err != nil {
		h.logger.Error("failed to create budget", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create budget")
		return
	}

	h.logger.Info("created budget", "id", budget.ID, "name", budget.Name, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusCreated, budget)
}

// Get handles GET /v1/cost/budgets/{id} — returns budget with utilization.
func (h *BudgetsHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "budget ID is required")
		return
	}

	budget, err := h.pg.GetBudget(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get budget", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get budget")
		return
	}
	if budget == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "budget not found")
		return
	}

	utilizationPct := 0
	if budget.LimitCents > 0 {
		utilizationPct = (budget.CurrentSpendCents * 100) / budget.LimitCents
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"budget":          budget,
		"utilization_pct": utilizationPct,
	})
}

// Update handles PUT /v1/cost/budgets/{id}.
func (h *BudgetsHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "budget ID is required")
		return
	}

	var req updateBudgetRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetBudget(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get budget for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get budget")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "budget not found")
		return
	}

	// Apply partial updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Scope != "" {
		if !validScopes[req.Scope] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid scope")
			return
		}
		existing.Scope = req.Scope
	}
	if req.ScopeValue != "" {
		existing.ScopeValue = req.ScopeValue
	}
	if req.LimitCents != nil {
		if *req.LimitCents <= 0 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "limit_cents must be a positive integer")
			return
		}
		existing.LimitCents = *req.LimitCents
	}
	if req.Period != "" {
		if !validPeriods[req.Period] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid period")
			return
		}
		existing.Period = req.Period
	}
	if req.Action != "" {
		if !validActions[req.Action] {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "invalid action")
			return
		}
		existing.Action = req.Action
	}
	if req.AlertThresholdPct != nil {
		if *req.AlertThresholdPct < 1 || *req.AlertThresholdPct > 100 {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "alert_threshold_pct must be between 1 and 100")
			return
		}
		existing.AlertThresholdPct = *req.AlertThresholdPct
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := h.pg.UpdateBudget(r.Context(), existing); err != nil {
		h.logger.Error("failed to update budget", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update budget")
		return
	}

	h.logger.Info("updated budget", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/cost/budgets/{id}.
func (h *BudgetsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "budget ID is required")
		return
	}

	if err := h.pg.DeleteBudget(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "budget not found")
			return
		}
		h.logger.Error("failed to delete budget", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete budget")
		return
	}

	h.logger.Info("deleted budget", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}
