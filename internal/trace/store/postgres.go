package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PostgresStore provides CRUD access to trace configuration data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// --- Agent ---

// Agent represents an agent definition.
type Agent struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Framework   string          `json:"framework"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ListAgents returns all agents for an organization.
func (s *PostgresStore) ListAgents(ctx context.Context, orgID string) ([]Agent, error) {
	query := `SELECT id, org_id, name, description, framework, metadata, created_at, updated_at
	          FROM agents WHERE org_id = $1 ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(&a.ID, &a.OrgID, &a.Name, &a.Description,
			&a.Framework, &a.Metadata, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		agents = append(agents, a)
	}
	if agents == nil {
		agents = []Agent{}
	}
	return agents, rows.Err()
}

// GetAgent returns a single agent by ID.
func (s *PostgresStore) GetAgent(ctx context.Context, orgID, id string) (*Agent, error) {
	query := `SELECT id, org_id, name, description, framework, metadata, created_at, updated_at
	          FROM agents WHERE org_id = $1 AND id = $2`

	var a Agent
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&a.ID, &a.OrgID, &a.Name, &a.Description,
		&a.Framework, &a.Metadata, &a.CreatedAt, &a.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get agent: %w", err)
	}
	return &a, nil
}

// CreateAgent inserts a new agent.
func (s *PostgresStore) CreateAgent(ctx context.Context, a *Agent) error {
	query := `INSERT INTO agents (org_id, name, description, framework, metadata)
	          VALUES ($1, $2, $3, $4, $5)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		a.OrgID, a.Name, a.Description, a.Framework, a.Metadata,
	).Scan(&a.ID, &a.CreatedAt, &a.UpdatedAt)
}

// UpdateAgent updates an existing agent.
func (s *PostgresStore) UpdateAgent(ctx context.Context, a *Agent) error {
	query := `UPDATE agents SET name = $1, description = $2, framework = $3,
	          metadata = $4, updated_at = NOW()
	          WHERE org_id = $5 AND id = $6
	          RETURNING updated_at`

	result := s.db.QueryRowContext(ctx, query,
		a.Name, a.Description, a.Framework, a.Metadata, a.OrgID, a.ID,
	)
	return result.Scan(&a.UpdatedAt)
}

// DeleteAgent removes an agent.
func (s *PostgresStore) DeleteAgent(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM agents WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete agent: %w", err)
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

// --- Failure Pattern ---

// FailurePattern represents a failure detection pattern.
type FailurePattern struct {
	ID             string          `json:"id"`
	OrgID          string          `json:"org_id"`
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Category       string          `json:"category"`
	DetectionRules json.RawMessage `json:"detection_rules"`
	Severity       string          `json:"severity"`
	IsBuiltin      bool            `json:"is_builtin"`
	Enabled        bool            `json:"enabled"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// ListPatterns returns all failure patterns for an organization.
func (s *PostgresStore) ListPatterns(ctx context.Context, orgID string) ([]FailurePattern, error) {
	query := `SELECT id, org_id, name, description, category, detection_rules,
	                 severity, is_builtin, enabled, created_at, updated_at
	          FROM failure_patterns WHERE org_id = $1 ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list patterns: %w", err)
	}
	defer rows.Close()

	var patterns []FailurePattern
	for rows.Next() {
		var p FailurePattern
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Description,
			&p.Category, &p.DetectionRules, &p.Severity, &p.IsBuiltin,
			&p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan pattern: %w", err)
		}
		patterns = append(patterns, p)
	}
	if patterns == nil {
		patterns = []FailurePattern{}
	}
	return patterns, rows.Err()
}

// GetPattern returns a single failure pattern by ID.
func (s *PostgresStore) GetPattern(ctx context.Context, orgID, id string) (*FailurePattern, error) {
	query := `SELECT id, org_id, name, description, category, detection_rules,
	                 severity, is_builtin, enabled, created_at, updated_at
	          FROM failure_patterns WHERE org_id = $1 AND id = $2`

	var p FailurePattern
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&p.ID, &p.OrgID, &p.Name, &p.Description,
		&p.Category, &p.DetectionRules, &p.Severity, &p.IsBuiltin,
		&p.Enabled, &p.CreatedAt, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get pattern: %w", err)
	}
	return &p, nil
}

// CreatePattern inserts a new failure pattern.
func (s *PostgresStore) CreatePattern(ctx context.Context, p *FailurePattern) error {
	query := `INSERT INTO failure_patterns (org_id, name, description, category,
	          detection_rules, severity, is_builtin, enabled)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		p.OrgID, p.Name, p.Description, p.Category,
		p.DetectionRules, p.Severity, p.IsBuiltin, p.Enabled,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
}

// UpdatePattern updates an existing failure pattern.
func (s *PostgresStore) UpdatePattern(ctx context.Context, p *FailurePattern) error {
	query := `UPDATE failure_patterns SET name = $1, description = $2, category = $3,
	          detection_rules = $4, severity = $5, enabled = $6, updated_at = NOW()
	          WHERE org_id = $7 AND id = $8
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		p.Name, p.Description, p.Category,
		p.DetectionRules, p.Severity, p.Enabled, p.OrgID, p.ID,
	).Scan(&p.UpdatedAt)
}

// DeletePattern removes a failure pattern.
func (s *PostgresStore) DeletePattern(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM failure_patterns WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete pattern: %w", err)
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

// --- Alert Rule ---

// AlertRule represents an alert configuration.
type AlertRule struct {
	ID              string          `json:"id"`
	OrgID           string          `json:"org_id"`
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	ConditionType   string          `json:"condition_type"`
	ConditionConfig json.RawMessage `json:"condition_config"`
	Channels        []string        `json:"channels"`
	ChannelConfig   json.RawMessage `json:"channel_config"`
	Enabled         bool            `json:"enabled"`
	LastTriggeredAt *time.Time      `json:"last_triggered_at,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// ListAlertRules returns all alert rules for an organization.
func (s *PostgresStore) ListAlertRules(ctx context.Context, orgID string) ([]AlertRule, error) {
	query := `SELECT id, org_id, name, description, condition_type, condition_config,
	                 channels, channel_config, enabled, last_triggered_at, created_at, updated_at
	          FROM alert_rules WHERE org_id = $1 ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list alert rules: %w", err)
	}
	defer rows.Close()

	var rules []AlertRule
	for rows.Next() {
		var r AlertRule
		var channels string
		if err := rows.Scan(&r.ID, &r.OrgID, &r.Name, &r.Description,
			&r.ConditionType, &r.ConditionConfig,
			&channels, &r.ChannelConfig, &r.Enabled,
			&r.LastTriggeredAt, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan alert rule: %w", err)
		}
		r.Channels = pgArrayToSlice(channels)
		rules = append(rules, r)
	}
	if rules == nil {
		rules = []AlertRule{}
	}
	return rules, rows.Err()
}

// GetAlertRule returns a single alert rule by ID.
func (s *PostgresStore) GetAlertRule(ctx context.Context, orgID, id string) (*AlertRule, error) {
	query := `SELECT id, org_id, name, description, condition_type, condition_config,
	                 channels, channel_config, enabled, last_triggered_at, created_at, updated_at
	          FROM alert_rules WHERE org_id = $1 AND id = $2`

	var r AlertRule
	var channels string
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&r.ID, &r.OrgID, &r.Name, &r.Description,
		&r.ConditionType, &r.ConditionConfig,
		&channels, &r.ChannelConfig, &r.Enabled,
		&r.LastTriggeredAt, &r.CreatedAt, &r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get alert rule: %w", err)
	}
	r.Channels = pgArrayToSlice(channels)
	return &r, nil
}

// CreateAlertRule inserts a new alert rule.
func (s *PostgresStore) CreateAlertRule(ctx context.Context, r *AlertRule) error {
	query := `INSERT INTO alert_rules (org_id, name, description, condition_type,
	          condition_config, channels, channel_config, enabled)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		r.OrgID, r.Name, r.Description, r.ConditionType,
		r.ConditionConfig, sliceToPGArray(r.Channels), r.ChannelConfig, r.Enabled,
	).Scan(&r.ID, &r.CreatedAt, &r.UpdatedAt)
}

// UpdateAlertRule updates an existing alert rule.
func (s *PostgresStore) UpdateAlertRule(ctx context.Context, r *AlertRule) error {
	query := `UPDATE alert_rules SET name = $1, description = $2, condition_type = $3,
	          condition_config = $4, channels = $5, channel_config = $6,
	          enabled = $7, updated_at = NOW()
	          WHERE org_id = $8 AND id = $9
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		r.Name, r.Description, r.ConditionType,
		r.ConditionConfig, sliceToPGArray(r.Channels), r.ChannelConfig,
		r.Enabled, r.OrgID, r.ID,
	).Scan(&r.UpdatedAt)
}

// DeleteAlertRule removes an alert rule.
func (s *PostgresStore) DeleteAlertRule(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM alert_rules WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete alert rule: %w", err)
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

// --- Helpers ---

// pgArrayToSlice converts a PostgreSQL text array literal to a Go string slice.
func pgArrayToSlice(s string) []string {
	if s == "" || s == "{}" {
		return []string{}
	}
	// Remove surrounding braces
	s = s[1 : len(s)-1]
	if s == "" {
		return []string{}
	}
	parts := splitPGArray(s)
	return parts
}

// splitPGArray splits a PostgreSQL array interior string on commas,
// respecting double-quoted elements.
func splitPGArray(s string) []string {
	var result []string
	var current []byte
	inQuotes := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch == '"' {
			inQuotes = !inQuotes
			continue
		}
		if ch == ',' && !inQuotes {
			result = append(result, string(current))
			current = current[:0]
			continue
		}
		current = append(current, ch)
	}
	result = append(result, string(current))
	return result
}

// sliceToPGArray converts a Go string slice to a PostgreSQL array literal.
func sliceToPGArray(ss []string) string {
	if len(ss) == 0 {
		return "{}"
	}
	elems := make([]string, len(ss))
	for i, s := range ss {
		elems[i] = `"` + s + `"`
	}
	return "{" + joinStrings(elems, ",") + "}"
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}
