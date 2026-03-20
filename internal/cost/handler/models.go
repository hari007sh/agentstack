package handler

import (
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/cost/store"
	"github.com/agentstack/agentstack/internal/server/httputil"
)

// ModelsHandler handles model pricing endpoints.
type ModelsHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewModelsHandler creates a new model pricing handler.
func NewModelsHandler(pg *store.PostgresStore, logger *slog.Logger) *ModelsHandler {
	return &ModelsHandler{pg: pg, logger: logger}
}

// upsertPricingRequest is the request body for updating model pricing.
type upsertPricingRequest struct {
	Provider        string `json:"provider"`
	Model           string `json:"model"`
	InputCostPer1M  int    `json:"input_cost_per_1m"`
	OutputCostPer1M int    `json:"output_cost_per_1m"`
}

// upsertPricingBatchRequest supports a list of pricing entries.
type upsertPricingBatchRequest struct {
	// Single entry fields (flat)
	upsertPricingRequest

	// Batch entries
	Pricing []upsertPricingRequest `json:"pricing"`
}

// List handles GET /v1/cost/models — list all model pricing.
func (h *ModelsHandler) List(w http.ResponseWriter, r *http.Request) {
	pricing, err := h.pg.ListModelPricing(r.Context())
	if err != nil {
		h.logger.Error("failed to list model pricing", "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list model pricing")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"pricing": pricing,
	})
}

// Upsert handles PUT /v1/cost/models — create or update model pricing.
func (h *ModelsHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	var req upsertPricingBatchRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// If batch entries provided, process them
	if len(req.Pricing) > 0 {
		h.upsertBatch(w, r, req.Pricing)
		return
	}

	// Single entry path
	if req.Provider == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "provider is required")
		return
	}
	if req.Model == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "model is required")
		return
	}
	if req.InputCostPer1M < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "input_cost_per_1m must be >= 0")
		return
	}
	if req.OutputCostPer1M < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "output_cost_per_1m must be >= 0")
		return
	}

	p := &store.ModelPricing{
		Provider:        req.Provider,
		Model:           req.Model,
		InputCostPer1M:  req.InputCostPer1M,
		OutputCostPer1M: req.OutputCostPer1M,
	}

	if err := h.pg.UpsertModelPricing(r.Context(), p); err != nil {
		h.logger.Error("failed to upsert model pricing", "provider", req.Provider, "model", req.Model, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPSERT_ERROR", "failed to update model pricing")
		return
	}

	h.logger.Info("upserted model pricing", "provider", p.Provider, "model", p.Model)
	httputil.WriteJSON(w, http.StatusOK, p)
}

func (h *ModelsHandler) upsertBatch(w http.ResponseWriter, r *http.Request, entries []upsertPricingRequest) {
	if len(entries) > 500 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "maximum 500 pricing entries per batch")
		return
	}

	results := make([]store.ModelPricing, 0, len(entries))
	for i, entry := range entries {
		if entry.Provider == "" || entry.Model == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"provider and model are required for pricing entry at index "+string(rune('0'+i)))
			return
		}

		p := &store.ModelPricing{
			Provider:        entry.Provider,
			Model:           entry.Model,
			InputCostPer1M:  entry.InputCostPer1M,
			OutputCostPer1M: entry.OutputCostPer1M,
		}

		if err := h.pg.UpsertModelPricing(r.Context(), p); err != nil {
			h.logger.Error("failed to upsert model pricing in batch",
				"provider", entry.Provider, "model", entry.Model, "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "UPSERT_ERROR", "failed to update model pricing")
			return
		}

		results = append(results, *p)
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"updated": len(results),
		"pricing": results,
	})
}
