// Package service provides business logic for the Cost module.
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/agentstack/agentstack/internal/cost/store"
)

// TrackerService handles cost event recording and querying.
type TrackerService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewTrackerService creates a new cost tracking service.
func NewTrackerService(pg *store.PostgresStore, logger *slog.Logger) *TrackerService {
	return &TrackerService{pg: pg, logger: logger}
}

// RecordEvent records a single cost event, computing cost from pricing if not provided.
func (s *TrackerService) RecordEvent(ctx context.Context, orgID string, event *store.CostEvent) error {
	event.OrgID = orgID

	// Auto-calculate total tokens if not set
	if event.TotalTokens == 0 {
		event.TotalTokens = event.InputTokens + event.OutputTokens
	}

	// If cost_cents is 0, try to compute from pricing table
	if event.CostCents == 0 && (event.InputTokens > 0 || event.OutputTokens > 0) {
		computed, err := s.CalculateCost(ctx, event.Model, event.Provider, event.InputTokens, event.OutputTokens)
		if err != nil {
			s.logger.Warn("failed to compute cost from pricing", "model", event.Model, "provider", event.Provider, "error", err)
		} else {
			event.CostCents = computed
		}
	}

	// Default metadata
	if event.Metadata == nil {
		event.Metadata = json.RawMessage(`{}`)
	}

	if err := s.pg.CreateCostEvent(ctx, event); err != nil {
		return fmt.Errorf("record cost event: %w", err)
	}

	s.logger.Debug("recorded cost event",
		"id", event.ID,
		"model", event.Model,
		"cost_cents", event.CostCents,
		"org_id", orgID,
	)
	return nil
}

// RecordEvents records multiple cost events in a batch.
func (s *TrackerService) RecordEvents(ctx context.Context, orgID string, events []store.CostEvent) error {
	for i := range events {
		events[i].OrgID = orgID

		if events[i].TotalTokens == 0 {
			events[i].TotalTokens = events[i].InputTokens + events[i].OutputTokens
		}

		if events[i].CostCents == 0 && (events[i].InputTokens > 0 || events[i].OutputTokens > 0) {
			computed, err := s.CalculateCost(ctx, events[i].Model, events[i].Provider, events[i].InputTokens, events[i].OutputTokens)
			if err == nil {
				events[i].CostCents = computed
			}
		}

		if events[i].Metadata == nil {
			events[i].Metadata = json.RawMessage(`{}`)
		}
	}

	if err := s.pg.CreateCostEvents(ctx, events); err != nil {
		return fmt.Errorf("record cost events batch: %w", err)
	}

	s.logger.Debug("recorded cost events batch", "count", len(events), "org_id", orgID)
	return nil
}

// GetEvents returns cost events matching the given filters.
func (s *TrackerService) GetEvents(ctx context.Context, orgID string, filter store.CostEventFilter) ([]store.CostEvent, int64, error) {
	return s.pg.ListCostEvents(ctx, orgID, filter)
}

// CalculateCost computes cost in integer cents from the model pricing table.
// Formula: (inputTokens * inputCostPer1M + outputTokens * outputCostPer1M) / 1_000_000
// All arithmetic stays in integer cents to avoid floating-point drift.
func (s *TrackerService) CalculateCost(ctx context.Context, model, provider string, inputTokens, outputTokens int) (int, error) {
	pricing, err := s.pg.GetModelPricing(ctx, provider, model)
	if err != nil {
		return 0, fmt.Errorf("lookup pricing: %w", err)
	}
	if pricing == nil {
		return 0, fmt.Errorf("no pricing found for %s/%s", provider, model)
	}

	// Integer arithmetic: (tokens * cents_per_1M) / 1_000_000
	// Use int64 to avoid overflow on large token counts
	inputCost := (int64(inputTokens) * int64(pricing.InputCostPer1M)) / 1_000_000
	outputCost := (int64(outputTokens) * int64(pricing.OutputCostPer1M)) / 1_000_000

	return int(inputCost + outputCost), nil
}
