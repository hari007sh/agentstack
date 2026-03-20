package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// ClickHouseStore provides read/write access to healing data in ClickHouse.
type ClickHouseStore struct {
	db *sql.DB
}

// NewClickHouseStore creates a new ClickHouse store for shield data.
func NewClickHouseStore(db *sql.DB) *ClickHouseStore {
	return &ClickHouseStore{db: db}
}

// --- Data types ---

// HealingEvent represents a healing event stored in ClickHouse.
type HealingEvent struct {
	ID            string    `json:"id"`
	SessionID     string    `json:"session_id"`
	SpanID        string    `json:"span_id,omitempty"`
	OrgID         string    `json:"org_id"`
	AgentName     string    `json:"agent_name,omitempty"`
	HealingType   string    `json:"healing_type"`
	TriggerReason string    `json:"trigger_reason,omitempty"`
	ActionTaken   string    `json:"action_taken,omitempty"`
	OriginalState string    `json:"original_state"`
	HealedState   string    `json:"healed_state"`
	Success       bool      `json:"success"`
	LatencyMs     uint32    `json:"latency_ms"`
	Metadata      string    `json:"metadata"`
	CreatedAt     time.Time `json:"created_at"`
}

// HealingStats holds aggregate healing statistics.
type HealingStats struct {
	TotalInterventions int     `json:"total_interventions"`
	SuccessCount       int     `json:"success_count"`
	SuccessRate        float64 `json:"success_rate"`
}

// HealingByType holds counts broken down by healing type.
type HealingByType struct {
	HealingType string `json:"healing_type"`
	Count       int    `json:"count"`
	SuccessRate float64 `json:"success_rate"`
}

// HealingTimeSeriesPoint represents a time-bucketed healing data point.
type HealingTimeSeriesPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Count     int       `json:"count"`
	Successes int       `json:"successes"`
}

// --- Write Methods ---

// InsertHealingEvents batch-inserts healing events into ClickHouse.
func (s *ClickHouseStore) InsertHealingEvents(ctx context.Context, events []HealingEvent) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO agentstack.healing_events
		 (id, session_id, span_id, org_id, agent_name, healing_type,
		  trigger_reason, action_taken, original_state, healed_state,
		  success, latency_ms, metadata, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("prepare: %w", err)
	}
	defer stmt.Close()

	for _, e := range events {
		var successUint uint8
		if e.Success {
			successUint = 1
		}

		_, err := stmt.ExecContext(ctx,
			e.ID, e.SessionID, e.SpanID, e.OrgID, e.AgentName, e.HealingType,
			e.TriggerReason, e.ActionTaken, e.OriginalState, e.HealedState,
			successUint, e.LatencyMs, e.Metadata, e.CreatedAt,
		)
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("exec healing event %s: %w", e.ID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// --- Read Methods ---

// GetHealingBySession returns all healing events for a given session.
func (s *ClickHouseStore) GetHealingBySession(ctx context.Context, orgID, sessionID string) ([]HealingEvent, error) {
	query := `SELECT id, session_id, span_id, org_id, agent_name, healing_type,
	                 trigger_reason, action_taken, original_state, healed_state,
	                 success, latency_ms, metadata, created_at
	          FROM agentstack.healing_events
	          WHERE org_id = ? AND session_id = ?
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, orgID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get healing by session: %w", err)
	}
	defer rows.Close()

	var events []HealingEvent
	for rows.Next() {
		var ev HealingEvent
		var success uint8
		if err := rows.Scan(
			&ev.ID, &ev.SessionID, &ev.SpanID, &ev.OrgID, &ev.AgentName, &ev.HealingType,
			&ev.TriggerReason, &ev.ActionTaken, &ev.OriginalState, &ev.HealedState,
			&success, &ev.LatencyMs, &ev.Metadata, &ev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan healing event: %w", err)
		}
		ev.Success = success == 1
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate healing events: %w", err)
	}

	if events == nil {
		events = []HealingEvent{}
	}
	return events, nil
}

// --- Analytics Methods ---

// GetHealingStats returns aggregate healing statistics for a time range.
func (s *ClickHouseStore) GetHealingStats(ctx context.Context, orgID string, start, end time.Time) (*HealingStats, error) {
	query := `SELECT
	            count() AS total,
	            countIf(success = 1) AS successes,
	            if(count() > 0, countIf(success = 1) / count(), 0) AS success_rate
	          FROM agentstack.healing_events
	          WHERE org_id = ? AND created_at >= ? AND created_at <= ?`

	var stats HealingStats
	err := s.db.QueryRowContext(ctx, query, orgID, start, end).Scan(
		&stats.TotalInterventions, &stats.SuccessCount, &stats.SuccessRate,
	)
	if err != nil {
		return nil, fmt.Errorf("get healing stats: %w", err)
	}
	return &stats, nil
}

// GetHealingByType returns healing counts and success rates grouped by type.
func (s *ClickHouseStore) GetHealingByType(ctx context.Context, orgID string, start, end time.Time) ([]HealingByType, error) {
	query := `SELECT
	            healing_type,
	            count() AS cnt,
	            if(count() > 0, countIf(success = 1) / count(), 0) AS success_rate
	          FROM agentstack.healing_events
	          WHERE org_id = ? AND created_at >= ? AND created_at <= ?
	          GROUP BY healing_type
	          ORDER BY cnt DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, start, end)
	if err != nil {
		return nil, fmt.Errorf("get healing by type: %w", err)
	}
	defer rows.Close()

	var results []HealingByType
	for rows.Next() {
		var r HealingByType
		if err := rows.Scan(&r.HealingType, &r.Count, &r.SuccessRate); err != nil {
			return nil, fmt.Errorf("scan healing by type: %w", err)
		}
		results = append(results, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate healing by type: %w", err)
	}

	if results == nil {
		results = []HealingByType{}
	}
	return results, nil
}

// GetHealingOverTime returns healing event counts bucketed by the given interval.
func (s *ClickHouseStore) GetHealingOverTime(ctx context.Context, orgID string, start, end time.Time, intervalSec int) ([]HealingTimeSeriesPoint, error) {
	query := `SELECT
	            toStartOfInterval(created_at, INTERVAL ? SECOND) AS bucket,
	            count() AS cnt,
	            countIf(success = 1) AS successes
	          FROM agentstack.healing_events
	          WHERE org_id = ? AND created_at >= ? AND created_at <= ?
	          GROUP BY bucket
	          ORDER BY bucket ASC`

	rows, err := s.db.QueryContext(ctx, query, intervalSec, orgID, start, end)
	if err != nil {
		return nil, fmt.Errorf("healing over time: %w", err)
	}
	defer rows.Close()

	var points []HealingTimeSeriesPoint
	for rows.Next() {
		var p HealingTimeSeriesPoint
		if err := rows.Scan(&p.Timestamp, &p.Count, &p.Successes); err != nil {
			return nil, fmt.Errorf("scan healing time series point: %w", err)
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate healing time series: %w", err)
	}

	if points == nil {
		points = []HealingTimeSeriesPoint{}
	}
	return points, nil
}
