// Package store provides PostgreSQL CRUD operations for the Guard module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PostgresStore provides CRUD access to guard data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Guard module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// --- Domain Structs ---

// Guardrail represents a guard rule configuration.
type Guardrail struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Mode        string          `json:"mode"`
	Config      json.RawMessage `json:"config"`
	ApplyTo     string          `json:"apply_to"`
	IsBuiltin   bool            `json:"is_builtin"`
	Enabled     bool            `json:"enabled"`
	Priority    int             `json:"priority"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// GuardEvent represents a guard check event.
type GuardEvent struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	GuardrailID string          `json:"guardrail_id"`
	SessionID   *string         `json:"session_id,omitempty"`
	Action      string          `json:"action"`
	GuardType   string          `json:"guard_type"`
	InputText   *string         `json:"input_text,omitempty"`
	Findings    json.RawMessage `json:"findings"`
	LatencyMs   int             `json:"latency_ms"`
	CreatedAt   time.Time       `json:"created_at"`
}

// GuardAnalytics holds aggregated guard analytics data.
type GuardAnalytics struct {
	TotalChecks  int64                `json:"total_checks"`
	TotalBlocked int64                `json:"total_blocked"`
	TotalWarned  int64                `json:"total_warned"`
	TotalPassed  int64                `json:"total_passed"`
	BlockRate    float64              `json:"block_rate"`
	ByType       []GuardTypeBreakdown `json:"by_type"`
}

// GuardTypeBreakdown holds analytics per guard type.
type GuardTypeBreakdown struct {
	GuardType string `json:"guard_type"`
	Total     int64  `json:"total"`
	Blocked   int64  `json:"blocked"`
	Warned    int64  `json:"warned"`
	Passed    int64  `json:"passed"`
}

// ===========================
// Guardrails CRUD
// ===========================

// ListGuardrails returns all guardrails for an organization.
func (s *PostgresStore) ListGuardrails(ctx context.Context, orgID string) ([]Guardrail, error) {
	query := `SELECT id, org_id, name, description, type, mode, config, apply_to,
	                 is_builtin, enabled, priority, created_at, updated_at
	          FROM guardrails
	          WHERE org_id = $1
	          ORDER BY priority DESC, created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list guardrails: %w", err)
	}
	defer rows.Close()

	var guardrails []Guardrail
	for rows.Next() {
		var g Guardrail
		if err := rows.Scan(&g.ID, &g.OrgID, &g.Name, &g.Description, &g.Type,
			&g.Mode, &g.Config, &g.ApplyTo, &g.IsBuiltin, &g.Enabled,
			&g.Priority, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan guardrail: %w", err)
		}
		guardrails = append(guardrails, g)
	}
	if guardrails == nil {
		guardrails = []Guardrail{}
	}
	return guardrails, rows.Err()
}

// ListActiveGuardrails returns enabled guardrails matching the given direction.
func (s *PostgresStore) ListActiveGuardrails(ctx context.Context, orgID, direction string) ([]Guardrail, error) {
	query := `SELECT id, org_id, name, description, type, mode, config, apply_to,
	                 is_builtin, enabled, priority, created_at, updated_at
	          FROM guardrails
	          WHERE org_id = $1 AND enabled = TRUE AND (apply_to = $2 OR apply_to = 'both')
	          ORDER BY priority DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, direction)
	if err != nil {
		return nil, fmt.Errorf("list active guardrails: %w", err)
	}
	defer rows.Close()

	var guardrails []Guardrail
	for rows.Next() {
		var g Guardrail
		if err := rows.Scan(&g.ID, &g.OrgID, &g.Name, &g.Description, &g.Type,
			&g.Mode, &g.Config, &g.ApplyTo, &g.IsBuiltin, &g.Enabled,
			&g.Priority, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan guardrail: %w", err)
		}
		guardrails = append(guardrails, g)
	}
	if guardrails == nil {
		guardrails = []Guardrail{}
	}
	return guardrails, rows.Err()
}

// ListGuardrailsByIDs returns guardrails matching a set of IDs for an organization.
func (s *PostgresStore) ListGuardrailsByIDs(ctx context.Context, orgID string, ids []string) ([]Guardrail, error) {
	if len(ids) == 0 {
		return []Guardrail{}, nil
	}

	// Build parameterized IN clause
	query := `SELECT id, org_id, name, description, type, mode, config, apply_to,
	                 is_builtin, enabled, priority, created_at, updated_at
	          FROM guardrails
	          WHERE org_id = $1 AND id = ANY($2)
	          ORDER BY priority DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, pgUUIDArray(ids))
	if err != nil {
		return nil, fmt.Errorf("list guardrails by IDs: %w", err)
	}
	defer rows.Close()

	var guardrails []Guardrail
	for rows.Next() {
		var g Guardrail
		if err := rows.Scan(&g.ID, &g.OrgID, &g.Name, &g.Description, &g.Type,
			&g.Mode, &g.Config, &g.ApplyTo, &g.IsBuiltin, &g.Enabled,
			&g.Priority, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan guardrail: %w", err)
		}
		guardrails = append(guardrails, g)
	}
	if guardrails == nil {
		guardrails = []Guardrail{}
	}
	return guardrails, rows.Err()
}

// GetGuardrail returns a single guardrail by ID.
func (s *PostgresStore) GetGuardrail(ctx context.Context, orgID, id string) (*Guardrail, error) {
	query := `SELECT id, org_id, name, description, type, mode, config, apply_to,
	                 is_builtin, enabled, priority, created_at, updated_at
	          FROM guardrails
	          WHERE org_id = $1 AND id = $2`

	var g Guardrail
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&g.ID, &g.OrgID, &g.Name, &g.Description, &g.Type,
		&g.Mode, &g.Config, &g.ApplyTo, &g.IsBuiltin, &g.Enabled,
		&g.Priority, &g.CreatedAt, &g.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get guardrail: %w", err)
	}
	return &g, nil
}

// CreateGuardrail inserts a new guardrail.
func (s *PostgresStore) CreateGuardrail(ctx context.Context, g *Guardrail) error {
	query := `INSERT INTO guardrails (org_id, name, description, type, mode, config,
	          apply_to, is_builtin, enabled, priority)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		g.OrgID, g.Name, g.Description, g.Type, g.Mode, g.Config,
		g.ApplyTo, g.IsBuiltin, g.Enabled, g.Priority,
	).Scan(&g.ID, &g.CreatedAt, &g.UpdatedAt)
}

// UpdateGuardrail updates an existing guardrail.
func (s *PostgresStore) UpdateGuardrail(ctx context.Context, g *Guardrail) error {
	query := `UPDATE guardrails SET name = $1, description = $2, type = $3,
	          mode = $4, config = $5, apply_to = $6, enabled = $7,
	          priority = $8, updated_at = NOW()
	          WHERE org_id = $9 AND id = $10
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		g.Name, g.Description, g.Type, g.Mode, g.Config,
		g.ApplyTo, g.Enabled, g.Priority, g.OrgID, g.ID,
	).Scan(&g.UpdatedAt)
}

// DeleteGuardrail removes a guardrail.
func (s *PostgresStore) DeleteGuardrail(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM guardrails WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete guardrail: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ===========================
// Guard Events
// ===========================

// CreateGuardEvent inserts a new guard event.
func (s *PostgresStore) CreateGuardEvent(ctx context.Context, e *GuardEvent) error {
	query := `INSERT INTO guard_events (org_id, guardrail_id, session_id, action,
	          guard_type, input_text, findings, latency_ms)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	          RETURNING id, created_at`

	return s.db.QueryRowContext(ctx, query,
		e.OrgID, e.GuardrailID, e.SessionID, e.Action,
		e.GuardType, e.InputText, e.Findings, e.LatencyMs,
	).Scan(&e.ID, &e.CreatedAt)
}

// ListGuardEvents returns guard events for an organization with optional filters.
func (s *PostgresStore) ListGuardEvents(ctx context.Context, orgID string, limit, offset int, action, guardType string) ([]GuardEvent, int64, error) {
	// Build WHERE clause
	where := "WHERE ge.org_id = $1"
	args := []interface{}{orgID}
	argIdx := 2

	if action != "" {
		where += fmt.Sprintf(" AND ge.action = $%d", argIdx)
		args = append(args, action)
		argIdx++
	}
	if guardType != "" {
		where += fmt.Sprintf(" AND ge.guard_type = $%d", argIdx)
		args = append(args, guardType)
		argIdx++
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM guard_events ge %s", where)
	var total int64
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count guard events: %w", err)
	}

	// Fetch page
	query := fmt.Sprintf(`SELECT ge.id, ge.org_id, ge.guardrail_id, ge.session_id,
	                 ge.action, ge.guard_type, ge.input_text, ge.findings,
	                 ge.latency_ms, ge.created_at
	          FROM guard_events ge
	          %s
	          ORDER BY ge.created_at DESC
	          LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list guard events: %w", err)
	}
	defer rows.Close()

	var events []GuardEvent
	for rows.Next() {
		var e GuardEvent
		if err := rows.Scan(&e.ID, &e.OrgID, &e.GuardrailID, &e.SessionID,
			&e.Action, &e.GuardType, &e.InputText, &e.Findings,
			&e.LatencyMs, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan guard event: %w", err)
		}
		events = append(events, e)
	}
	if events == nil {
		events = []GuardEvent{}
	}
	return events, total, rows.Err()
}

// GetGuardAnalytics returns aggregated analytics for guard events.
func (s *PostgresStore) GetGuardAnalytics(ctx context.Context, orgID string) (*GuardAnalytics, error) {
	// Overall counts
	overallQuery := `SELECT
	    COUNT(*) AS total,
	    COUNT(*) FILTER (WHERE action = 'blocked') AS blocked,
	    COUNT(*) FILTER (WHERE action = 'warned') AS warned,
	    COUNT(*) FILTER (WHERE action = 'passed') AS passed
	FROM guard_events
	WHERE org_id = $1`

	analytics := &GuardAnalytics{}
	if err := s.db.QueryRowContext(ctx, overallQuery, orgID).Scan(
		&analytics.TotalChecks, &analytics.TotalBlocked,
		&analytics.TotalWarned, &analytics.TotalPassed,
	); err != nil {
		return nil, fmt.Errorf("get guard analytics overview: %w", err)
	}

	if analytics.TotalChecks > 0 {
		analytics.BlockRate = float64(analytics.TotalBlocked) / float64(analytics.TotalChecks)
	}

	// By type
	byTypeQuery := `SELECT
	    guard_type,
	    COUNT(*) AS total,
	    COUNT(*) FILTER (WHERE action = 'blocked') AS blocked,
	    COUNT(*) FILTER (WHERE action = 'warned') AS warned,
	    COUNT(*) FILTER (WHERE action = 'passed') AS passed
	FROM guard_events
	WHERE org_id = $1
	GROUP BY guard_type
	ORDER BY total DESC`

	rows, err := s.db.QueryContext(ctx, byTypeQuery, orgID)
	if err != nil {
		return nil, fmt.Errorf("get guard analytics by type: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var bt GuardTypeBreakdown
		if err := rows.Scan(&bt.GuardType, &bt.Total, &bt.Blocked, &bt.Warned, &bt.Passed); err != nil {
			return nil, fmt.Errorf("scan guard type breakdown: %w", err)
		}
		analytics.ByType = append(analytics.ByType, bt)
	}
	if analytics.ByType == nil {
		analytics.ByType = []GuardTypeBreakdown{}
	}

	return analytics, rows.Err()
}

// ===========================
// Helpers
// ===========================

// pgUUIDArray converts a string slice to a PostgreSQL UUID array literal.
func pgUUIDArray(ids []string) string {
	result := "{"
	for i, id := range ids {
		if i > 0 {
			result += ","
		}
		result += id
	}
	result += "}"
	return result
}
