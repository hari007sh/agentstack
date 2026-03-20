package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/shield/store"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATS subject for healing event ingestion.
const SubjectHealingIngest = "trace.ingest.healing"

// HealingIngestRequest represents a healing event to be ingested.
type HealingIngestRequest struct {
	ID            string `json:"id"`
	SessionID     string `json:"session_id"`
	SpanID        string `json:"span_id"`
	OrgID         string `json:"org_id"`
	AgentName     string `json:"agent_name"`
	HealingType   string `json:"healing_type"`
	TriggerReason string `json:"trigger_reason"`
	ActionTaken   string `json:"action_taken"`
	OriginalState string `json:"original_state"`
	HealedState   string `json:"healed_state"`
	Success       bool   `json:"success"`
	LatencyMs     uint32 `json:"latency_ms"`
	Metadata      string `json:"metadata"`
	CreatedAt     string `json:"created_at"`
}

// HealingAnalyticsResponse contains the full healing analytics payload.
type HealingAnalyticsResponse struct {
	TotalInterventions int                          `json:"total_interventions"`
	SuccessCount       int                          `json:"success_count"`
	SuccessRate        float64                      `json:"success_rate"`
	ByType             []store.HealingByType        `json:"by_type"`
	OverTime           []store.HealingTimeSeriesPoint `json:"over_time"`
}

// HealingService handles healing event ingestion and querying.
type HealingService struct {
	nc     *nats.Conn
	ch     *store.ClickHouseStore
	logger *slog.Logger
}

// NewHealingService creates a new healing service.
// nc is required for ingestion; ch may be nil if ClickHouse is unavailable.
func NewHealingService(nc *nats.Conn, ch *store.ClickHouseStore, logger *slog.Logger) *HealingService {
	return &HealingService{nc: nc, ch: ch, logger: logger}
}

// IngestHealing publishes healing events to NATS for async ClickHouse writing.
func (s *HealingService) IngestHealing(ctx context.Context, orgID string, events []HealingIngestRequest) error {
	for i := range events {
		s.fillDefaults(orgID, &events[i])

		data, err := json.Marshal(&events[i])
		if err != nil {
			return fmt.Errorf("marshal healing event: %w", err)
		}

		if err := s.nc.Publish(SubjectHealingIngest, data); err != nil {
			return fmt.Errorf("publish healing event: %w", err)
		}
	}

	s.logger.Debug("published healing events", "count", len(events), "org_id", orgID)
	return nil
}

// GetSessionHealing returns all healing events for a session.
func (s *HealingService) GetSessionHealing(ctx context.Context, orgID, sessionID string) ([]store.HealingEvent, error) {
	if s.ch == nil {
		return nil, fmt.Errorf("ClickHouse not available")
	}

	events, err := s.ch.GetHealingBySession(ctx, orgID, sessionID)
	if err != nil {
		s.logger.Error("failed to get session healing events", "session_id", sessionID, "error", err)
		return nil, err
	}
	return events, nil
}

// GetHealingAnalytics computes healing analytics for a time range.
func (s *HealingService) GetHealingAnalytics(ctx context.Context, orgID string, start, end time.Time, intervalSec int) (*HealingAnalyticsResponse, error) {
	if s.ch == nil {
		return nil, fmt.Errorf("ClickHouse not available")
	}

	if intervalSec <= 0 {
		intervalSec = 3600
	}

	stats, err := s.ch.GetHealingStats(ctx, orgID, start, end)
	if err != nil {
		s.logger.Error("failed to get healing stats", "org_id", orgID, "error", err)
		return nil, err
	}

	byType, err := s.ch.GetHealingByType(ctx, orgID, start, end)
	if err != nil {
		s.logger.Error("failed to get healing by type", "org_id", orgID, "error", err)
		return nil, err
	}

	overTime, err := s.ch.GetHealingOverTime(ctx, orgID, start, end, intervalSec)
	if err != nil {
		s.logger.Error("failed to get healing over time", "org_id", orgID, "error", err)
		return nil, err
	}

	return &HealingAnalyticsResponse{
		TotalInterventions: stats.TotalInterventions,
		SuccessCount:       stats.SuccessCount,
		SuccessRate:        stats.SuccessRate,
		ByType:             byType,
		OverTime:           overTime,
	}, nil
}

// fillDefaults sets default values on a healing ingest request.
func (s *HealingService) fillDefaults(orgID string, req *HealingIngestRequest) {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.OrgID = orgID
	if req.OriginalState == "" {
		req.OriginalState = "{}"
	}
	if req.HealedState == "" {
		req.HealedState = "{}"
	}
	if req.Metadata == "" {
		req.Metadata = "{}"
	}
	if req.CreatedAt == "" {
		req.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
}
