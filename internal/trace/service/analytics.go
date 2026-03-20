package service

import (
	"context"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/trace/store"
)

// AnalyticsService computes analytics from ClickHouse trace data.
type AnalyticsService struct {
	ch     *store.ClickHouseStore
	logger *slog.Logger
}

// NewAnalyticsService creates a new analytics service.
func NewAnalyticsService(ch *store.ClickHouseStore, logger *slog.Logger) *AnalyticsService {
	return &AnalyticsService{ch: ch, logger: logger}
}

// OverviewResponse contains the overview analytics data.
type OverviewResponse struct {
	TotalSessions    int     `json:"total_sessions"`
	FailedSessions   int     `json:"failed_sessions"`
	FailureRate      float64 `json:"failure_rate"`
	ReliabilityScore float64 `json:"reliability_score"`
	AvgCostCents     float64 `json:"avg_cost_cents"`
	AvgDurationMs    float64 `json:"avg_duration_ms"`
	TotalTokens      uint64  `json:"total_tokens"`
	TotalCostCents   uint64  `json:"total_cost_cents"`
	HealedSessions   int     `json:"healed_sessions"`
}

// GetOverview returns overview statistics for the given time range.
func (s *AnalyticsService) GetOverview(ctx context.Context, orgID string, start, end time.Time) (*OverviewResponse, error) {
	stats, err := s.ch.GetOverviewStats(ctx, orgID, start, end)
	if err != nil {
		s.logger.Error("failed to get overview stats", "org_id", orgID, "error", err)
		return nil, err
	}

	// Reliability score: 1.0 - failure_rate, clamped to [0, 1].
	reliability := 1.0 - stats.FailureRate
	if reliability < 0 {
		reliability = 0
	}
	if reliability > 1 {
		reliability = 1
	}

	return &OverviewResponse{
		TotalSessions:    stats.TotalSessions,
		FailedSessions:   stats.FailedSessions,
		FailureRate:      stats.FailureRate,
		ReliabilityScore: reliability,
		AvgCostCents:     stats.AvgCostCents,
		AvgDurationMs:    stats.AvgDurationMs,
		TotalTokens:      stats.TotalTokens,
		TotalCostCents:   stats.TotalCostCents,
		HealedSessions:   stats.HealedSessions,
	}, nil
}

// GetSessionsOverTime returns a time series of session counts.
func (s *AnalyticsService) GetSessionsOverTime(ctx context.Context, orgID string, start, end time.Time, intervalSec int) ([]store.TimeSeriesPoint, error) {
	if intervalSec <= 0 {
		intervalSec = 3600 // default 1 hour
	}

	points, err := s.ch.GetSessionsOverTime(ctx, orgID, start, end, intervalSec)
	if err != nil {
		s.logger.Error("failed to get sessions over time", "org_id", orgID, "error", err)
		return nil, err
	}
	return points, nil
}

// GetFailureRateOverTime returns failure rate as a time series.
func (s *AnalyticsService) GetFailureRateOverTime(ctx context.Context, orgID string, start, end time.Time, intervalSec int) ([]store.FailureRatePoint, error) {
	if intervalSec <= 0 {
		intervalSec = 3600
	}

	points, err := s.ch.GetFailureRateOverTime(ctx, orgID, start, end, intervalSec)
	if err != nil {
		s.logger.Error("failed to get failure rate over time", "org_id", orgID, "error", err)
		return nil, err
	}
	return points, nil
}
