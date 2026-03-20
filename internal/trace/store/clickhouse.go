package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ClickHouseStore provides read access to trace data stored in ClickHouse.
type ClickHouseStore struct {
	db *sql.DB
}

// NewClickHouseStore creates a new ClickHouse store.
func NewClickHouseStore(db *sql.DB) *ClickHouseStore {
	return &ClickHouseStore{db: db}
}

// --- Data types ---

// Session represents a trace session stored in ClickHouse.
type Session struct {
	ID             string    `json:"id"`
	OrgID          string    `json:"org_id"`
	AgentName      string    `json:"agent_name"`
	AgentID        string    `json:"agent_id"`
	Status         string    `json:"status"`
	Input          string    `json:"input"`
	Output         string    `json:"output"`
	Error          string    `json:"error,omitempty"`
	Metadata       string    `json:"metadata"`
	TotalTokens    uint64    `json:"total_tokens"`
	TotalCostCents uint64    `json:"total_cost_cents"`
	TotalSpans     uint32    `json:"total_spans"`
	DurationMs     uint64    `json:"duration_ms"`
	HasHealing     bool      `json:"has_healing"`
	Tags           []string  `json:"tags"`
	StartedAt      time.Time `json:"started_at"`
	EndedAt        time.Time `json:"ended_at"`
	CreatedAt      time.Time `json:"created_at"`
}

// Span represents a trace span stored in ClickHouse.
type Span struct {
	ID           string    `json:"id"`
	SessionID    string    `json:"session_id"`
	OrgID        string    `json:"org_id"`
	ParentID     string    `json:"parent_id,omitempty"`
	Name         string    `json:"name"`
	SpanType     string    `json:"span_type"`
	Status       string    `json:"status"`
	Input        string    `json:"input"`
	Output       string    `json:"output"`
	Error        string    `json:"error,omitempty"`
	Model        string    `json:"model,omitempty"`
	Provider     string    `json:"provider,omitempty"`
	InputTokens  uint32    `json:"input_tokens"`
	OutputTokens uint32    `json:"output_tokens"`
	TotalTokens  uint32    `json:"total_tokens"`
	CostCents    uint32    `json:"cost_cents"`
	DurationMs   uint64    `json:"duration_ms"`
	Metadata     string    `json:"metadata"`
	StartedAt    time.Time `json:"started_at"`
	EndedAt      time.Time `json:"ended_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// Event represents a trace event stored in ClickHouse.
type Event struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	SpanID    string    `json:"span_id,omitempty"`
	OrgID     string    `json:"org_id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	Data      string    `json:"data"`
	CreatedAt time.Time `json:"created_at"`
}

// --- Filter / Pagination ---

// SessionFilter contains filter criteria for listing sessions.
type SessionFilter struct {
	AgentName string
	Status    string
	StartDate *time.Time
	EndDate   *time.Time
	Limit     int
	Offset    int
}

// --- Query Methods ---

// ListSessions returns sessions matching the given filter.
func (s *ClickHouseStore) ListSessions(ctx context.Context, orgID string, f SessionFilter) ([]Session, int, error) {
	if f.Limit <= 0 {
		f.Limit = 50
	}
	if f.Limit > 200 {
		f.Limit = 200
	}

	where := []string{"org_id = ?"}
	args := []interface{}{orgID}

	if f.AgentName != "" {
		where = append(where, "agent_name = ?")
		args = append(args, f.AgentName)
	}
	if f.Status != "" {
		where = append(where, "status = ?")
		args = append(args, f.Status)
	}
	if f.StartDate != nil {
		where = append(where, "started_at >= ?")
		args = append(args, *f.StartDate)
	}
	if f.EndDate != nil {
		where = append(where, "started_at <= ?")
		args = append(args, *f.EndDate)
	}

	whereClause := strings.Join(where, " AND ")

	// Count query
	countQuery := fmt.Sprintf("SELECT count() FROM agentstack.sessions WHERE %s", whereClause)
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count sessions: %w", err)
	}

	// Data query
	query := fmt.Sprintf(
		`SELECT id, org_id, agent_name, agent_id, status, input, output, error,
		        metadata, total_tokens, total_cost_cents, total_spans, duration_ms,
		        has_healing, tags, started_at, ended_at, created_at
		 FROM agentstack.sessions
		 WHERE %s
		 ORDER BY started_at DESC
		 LIMIT ? OFFSET ?`, whereClause)

	args = append(args, f.Limit, f.Offset)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list sessions: %w", err)
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		var sess Session
		var hasHealing uint8
		var tags []string
		if err := rows.Scan(
			&sess.ID, &sess.OrgID, &sess.AgentName, &sess.AgentID,
			&sess.Status, &sess.Input, &sess.Output, &sess.Error,
			&sess.Metadata, &sess.TotalTokens, &sess.TotalCostCents,
			&sess.TotalSpans, &sess.DurationMs, &hasHealing,
			&tags, &sess.StartedAt, &sess.EndedAt, &sess.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan session: %w", err)
		}
		sess.HasHealing = hasHealing == 1
		sess.Tags = tags
		if sess.Tags == nil {
			sess.Tags = []string{}
		}
		sessions = append(sessions, sess)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate sessions: %w", err)
	}

	if sessions == nil {
		sessions = []Session{}
	}
	return sessions, total, nil
}

// GetSession returns a single session by ID.
func (s *ClickHouseStore) GetSession(ctx context.Context, orgID, sessionID string) (*Session, error) {
	query := `SELECT id, org_id, agent_name, agent_id, status, input, output, error,
	                 metadata, total_tokens, total_cost_cents, total_spans, duration_ms,
	                 has_healing, tags, started_at, ended_at, created_at
	          FROM agentstack.sessions
	          WHERE org_id = ? AND id = ?
	          LIMIT 1`

	var sess Session
	var hasHealing uint8
	var tags []string
	err := s.db.QueryRowContext(ctx, query, orgID, sessionID).Scan(
		&sess.ID, &sess.OrgID, &sess.AgentName, &sess.AgentID,
		&sess.Status, &sess.Input, &sess.Output, &sess.Error,
		&sess.Metadata, &sess.TotalTokens, &sess.TotalCostCents,
		&sess.TotalSpans, &sess.DurationMs, &hasHealing,
		&tags, &sess.StartedAt, &sess.EndedAt, &sess.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	sess.HasHealing = hasHealing == 1
	sess.Tags = tags
	if sess.Tags == nil {
		sess.Tags = []string{}
	}
	return &sess, nil
}

// GetSessionSpans returns all spans for a session, ordered for tree construction.
func (s *ClickHouseStore) GetSessionSpans(ctx context.Context, orgID, sessionID string) ([]Span, error) {
	query := `SELECT id, session_id, org_id, parent_id, name, span_type, status,
	                 input, output, error, model, provider,
	                 input_tokens, output_tokens, total_tokens, cost_cents,
	                 duration_ms, metadata, started_at, ended_at, created_at
	          FROM agentstack.spans
	          WHERE org_id = ? AND session_id = ?
	          ORDER BY started_at ASC`

	rows, err := s.db.QueryContext(ctx, query, orgID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get session spans: %w", err)
	}
	defer rows.Close()

	var spans []Span
	for rows.Next() {
		var sp Span
		if err := rows.Scan(
			&sp.ID, &sp.SessionID, &sp.OrgID, &sp.ParentID,
			&sp.Name, &sp.SpanType, &sp.Status,
			&sp.Input, &sp.Output, &sp.Error,
			&sp.Model, &sp.Provider,
			&sp.InputTokens, &sp.OutputTokens, &sp.TotalTokens, &sp.CostCents,
			&sp.DurationMs, &sp.Metadata, &sp.StartedAt, &sp.EndedAt, &sp.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan span: %w", err)
		}
		spans = append(spans, sp)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate spans: %w", err)
	}

	if spans == nil {
		spans = []Span{}
	}
	return spans, nil
}

// GetSessionEvents returns all events for a session.
func (s *ClickHouseStore) GetSessionEvents(ctx context.Context, orgID, sessionID string) ([]Event, error) {
	query := `SELECT id, session_id, span_id, org_id, type, name, data, created_at
	          FROM agentstack.events
	          WHERE org_id = ? AND session_id = ?
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, orgID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("get session events: %w", err)
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var ev Event
		if err := rows.Scan(
			&ev.ID, &ev.SessionID, &ev.SpanID, &ev.OrgID,
			&ev.Type, &ev.Name, &ev.Data, &ev.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		events = append(events, ev)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}

	if events == nil {
		events = []Event{}
	}
	return events, nil
}

// --- Analytics Queries ---

// OverviewStats holds aggregate statistics for the overview endpoint.
type OverviewStats struct {
	TotalSessions   int     `json:"total_sessions"`
	FailedSessions  int     `json:"failed_sessions"`
	FailureRate     float64 `json:"failure_rate"`
	AvgCostCents    float64 `json:"avg_cost_cents"`
	AvgDurationMs   float64 `json:"avg_duration_ms"`
	TotalTokens     uint64  `json:"total_tokens"`
	TotalCostCents  uint64  `json:"total_cost_cents"`
	HealedSessions  int     `json:"healed_sessions"`
}

// GetOverviewStats computes aggregate stats for a time range.
func (s *ClickHouseStore) GetOverviewStats(ctx context.Context, orgID string, start, end time.Time) (*OverviewStats, error) {
	query := `SELECT
	            count() AS total,
	            countIf(status = 'failed') AS failed,
	            if(count() > 0, countIf(status = 'failed') / count(), 0) AS failure_rate,
	            if(count() > 0, avg(total_cost_cents), 0) AS avg_cost,
	            if(count() > 0, avg(duration_ms), 0) AS avg_duration,
	            sum(total_tokens) AS tokens,
	            sum(total_cost_cents) AS cost,
	            countIf(has_healing = 1) AS healed
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ? AND started_at <= ?`

	var stats OverviewStats
	err := s.db.QueryRowContext(ctx, query, orgID, start, end).Scan(
		&stats.TotalSessions, &stats.FailedSessions, &stats.FailureRate,
		&stats.AvgCostCents, &stats.AvgDurationMs,
		&stats.TotalTokens, &stats.TotalCostCents, &stats.HealedSessions,
	)
	if err != nil {
		return nil, fmt.Errorf("get overview stats: %w", err)
	}
	return &stats, nil
}

// TimeSeriesPoint represents a single data point in a time series.
type TimeSeriesPoint struct {
	Timestamp time.Time `json:"timestamp"`
	Count     int       `json:"count"`
}

// GetSessionsOverTime returns session counts bucketed by the given interval.
func (s *ClickHouseStore) GetSessionsOverTime(ctx context.Context, orgID string, start, end time.Time, intervalSec int) ([]TimeSeriesPoint, error) {
	query := `SELECT
	            toStartOfInterval(started_at, INTERVAL ? SECOND) AS bucket,
	            count() AS cnt
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ? AND started_at <= ?
	          GROUP BY bucket
	          ORDER BY bucket ASC`

	rows, err := s.db.QueryContext(ctx, query, intervalSec, orgID, start, end)
	if err != nil {
		return nil, fmt.Errorf("sessions over time: %w", err)
	}
	defer rows.Close()

	var points []TimeSeriesPoint
	for rows.Next() {
		var p TimeSeriesPoint
		if err := rows.Scan(&p.Timestamp, &p.Count); err != nil {
			return nil, fmt.Errorf("scan time series point: %w", err)
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate time series: %w", err)
	}

	if points == nil {
		points = []TimeSeriesPoint{}
	}
	return points, nil
}

// FailureRatePoint represents failure rate at a point in time.
type FailureRatePoint struct {
	Timestamp   time.Time `json:"timestamp"`
	Total       int       `json:"total"`
	Failed      int       `json:"failed"`
	FailureRate float64   `json:"failure_rate"`
}

// GetFailureRateOverTime returns failure rate bucketed by the given interval.
func (s *ClickHouseStore) GetFailureRateOverTime(ctx context.Context, orgID string, start, end time.Time, intervalSec int) ([]FailureRatePoint, error) {
	query := `SELECT
	            toStartOfInterval(started_at, INTERVAL ? SECOND) AS bucket,
	            count() AS total,
	            countIf(status = 'failed') AS failed,
	            if(count() > 0, countIf(status = 'failed') / count(), 0) AS rate
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ? AND started_at <= ?
	          GROUP BY bucket
	          ORDER BY bucket ASC`

	rows, err := s.db.QueryContext(ctx, query, intervalSec, orgID, start, end)
	if err != nil {
		return nil, fmt.Errorf("failure rate over time: %w", err)
	}
	defer rows.Close()

	var points []FailureRatePoint
	for rows.Next() {
		var p FailureRatePoint
		if err := rows.Scan(&p.Timestamp, &p.Total, &p.Failed, &p.FailureRate); err != nil {
			return nil, fmt.Errorf("scan failure rate point: %w", err)
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate failure rate: %w", err)
	}

	if points == nil {
		points = []FailureRatePoint{}
	}
	return points, nil
}
