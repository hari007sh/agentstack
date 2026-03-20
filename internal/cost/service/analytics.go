package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/cost/store"
)

// AnalyticsService provides cost analytics aggregations.
type AnalyticsService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewAnalyticsService creates a new cost analytics service.
func NewAnalyticsService(pg *store.PostgresStore, logger *slog.Logger) *AnalyticsService {
	return &AnalyticsService{pg: pg, logger: logger}
}

// SummaryResponse holds the full cost summary response including trend data.
type SummaryResponse struct {
	*store.CostSummary
	Trend []store.CostTrendPoint `json:"trend"`
}

// GetSummary returns a full cost summary with trend data.
func (s *AnalyticsService) GetSummary(ctx context.Context, orgID string, from, to time.Time) (*SummaryResponse, error) {
	summary, err := s.pg.GetCostSummary(ctx, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("get summary: %w", err)
	}

	trend, err := s.pg.GetCostTrend(ctx, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("get trend: %w", err)
	}

	return &SummaryResponse{
		CostSummary: summary,
		Trend:       trend,
	}, nil
}

// GetByModel returns cost breakdown grouped by model.
func (s *AnalyticsService) GetByModel(ctx context.Context, orgID string, from, to time.Time) ([]store.ModelCostBreakdown, error) {
	return s.pg.GetCostByModel(ctx, orgID, from, to)
}

// GetByAgent returns cost breakdown grouped by agent.
func (s *AnalyticsService) GetByAgent(ctx context.Context, orgID string, from, to time.Time) ([]store.AgentCostBreakdown, error) {
	return s.pg.GetCostByAgent(ctx, orgID, from, to)
}

// GetTopSpenders returns top spending agents and models.
func (s *AnalyticsService) GetTopSpenders(ctx context.Context, orgID string, from, to time.Time, limit int) ([]store.TopSpender, error) {
	return s.pg.GetTopSpenders(ctx, orgID, from, to, limit)
}

// CompareModels returns model comparison data including pricing info.
func (s *AnalyticsService) CompareModels(ctx context.Context, orgID string, from, to time.Time) ([]store.ModelComparison, error) {
	return s.pg.CompareModels(ctx, orgID, from, to)
}
