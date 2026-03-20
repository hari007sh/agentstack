// Package store provides PostgreSQL CRUD operations for the Cost module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PostgresStore provides CRUD access to cost data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Cost module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// ========================
// Domain Structs
// ========================

// CostEvent represents a single cost event row.
type CostEvent struct {
	ID           string          `json:"id"`
	OrgID        string          `json:"org_id"`
	SessionID    string          `json:"session_id,omitempty"`
	SpanID       string          `json:"span_id,omitempty"`
	AgentName    string          `json:"agent_name"`
	Model        string          `json:"model"`
	Provider     string          `json:"provider"`
	InputTokens  int             `json:"input_tokens"`
	OutputTokens int             `json:"output_tokens"`
	TotalTokens  int             `json:"total_tokens"`
	CostCents    int             `json:"cost_cents"`
	Outcome      string          `json:"outcome"`
	Metadata     json.RawMessage `json:"metadata"`
	CreatedAt    time.Time       `json:"created_at"`
}

// Budget represents a budget policy row.
type Budget struct {
	ID                string    `json:"id"`
	OrgID             string    `json:"org_id"`
	Name              string    `json:"name"`
	Description       string    `json:"description"`
	Scope             string    `json:"scope"`
	ScopeValue        string    `json:"scope_value"`
	LimitCents        int       `json:"limit_cents"`
	Period            string    `json:"period"`
	Action            string    `json:"action"`
	CurrentSpendCents int       `json:"current_spend_cents"`
	PeriodStart       time.Time `json:"period_start"`
	AlertThresholdPct int       `json:"alert_threshold_pct"`
	Enabled           bool      `json:"enabled"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// ModelPricing represents a model pricing row.
type ModelPricing struct {
	ID              string    `json:"id"`
	Provider        string    `json:"provider"`
	Model           string    `json:"model"`
	InputCostPer1M  int       `json:"input_cost_per_1m"`
	OutputCostPer1M int       `json:"output_cost_per_1m"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// CostEventFilter holds query parameters for listing cost events.
type CostEventFilter struct {
	AgentName string
	Model     string
	Provider  string
	Outcome   string
	From      time.Time
	To        time.Time
	Limit     int
	Offset    int
}

// CostSummary holds aggregated cost summary data.
type CostSummary struct {
	TotalSpendCents    int64   `json:"total_spend_cents"`
	TotalEvents        int64   `json:"total_events"`
	TotalInputTokens   int64   `json:"total_input_tokens"`
	TotalOutputTokens  int64   `json:"total_output_tokens"`
	AvgCostPerSession  int64   `json:"avg_cost_per_session_cents"`
	UniqueModels       int64   `json:"unique_models"`
	UniqueAgents       int64   `json:"unique_agents"`
}

// CostTrendPoint represents a single point in a cost trend time series.
type CostTrendPoint struct {
	Date       string `json:"date"`
	SpendCents int64  `json:"spend_cents"`
	Events     int64  `json:"events"`
}

// ModelCostBreakdown holds cost aggregation by model.
type ModelCostBreakdown struct {
	Model           string `json:"model"`
	Provider        string `json:"provider"`
	TotalCostCents  int64  `json:"total_cost_cents"`
	TotalEvents     int64  `json:"total_events"`
	TotalInputTokens  int64 `json:"total_input_tokens"`
	TotalOutputTokens int64 `json:"total_output_tokens"`
	AvgCostCents    int64  `json:"avg_cost_cents"`
}

// AgentCostBreakdown holds cost aggregation by agent.
type AgentCostBreakdown struct {
	AgentName       string `json:"agent_name"`
	TotalCostCents  int64  `json:"total_cost_cents"`
	TotalEvents     int64  `json:"total_events"`
	TotalTokens     int64  `json:"total_tokens"`
	AvgCostCents    int64  `json:"avg_cost_cents"`
}

// TopSpender represents a top spending entity.
type TopSpender struct {
	Name           string `json:"name"`
	Type           string `json:"type"` // "agent" or "model"
	TotalCostCents int64  `json:"total_cost_cents"`
	TotalEvents    int64  `json:"total_events"`
}

// ModelComparison holds data for comparing model costs.
type ModelComparison struct {
	Model             string `json:"model"`
	Provider          string `json:"provider"`
	TotalCostCents    int64  `json:"total_cost_cents"`
	TotalEvents       int64  `json:"total_events"`
	AvgCostCents      int64  `json:"avg_cost_cents"`
	AvgInputTokens    int64  `json:"avg_input_tokens"`
	AvgOutputTokens   int64  `json:"avg_output_tokens"`
	SuccessRate       float64 `json:"success_rate"`
	InputCostPer1M    int    `json:"input_cost_per_1m"`
	OutputCostPer1M   int    `json:"output_cost_per_1m"`
}

// ========================
// Cost Events CRUD
// ========================

// CreateCostEvent inserts a new cost event.
func (s *PostgresStore) CreateCostEvent(ctx context.Context, e *CostEvent) error {
	query := `INSERT INTO cost_events (org_id, session_id, span_id, agent_name, model, provider,
	          input_tokens, output_tokens, total_tokens, cost_cents, outcome, metadata)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	          RETURNING id, created_at`

	return s.db.QueryRowContext(ctx, query,
		e.OrgID, e.SessionID, e.SpanID, e.AgentName, e.Model, e.Provider,
		e.InputTokens, e.OutputTokens, e.TotalTokens, e.CostCents, e.Outcome, e.Metadata,
	).Scan(&e.ID, &e.CreatedAt)
}

// CreateCostEvents inserts multiple cost events in a single transaction.
func (s *PostgresStore) CreateCostEvents(ctx context.Context, events []CostEvent) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx,
		`INSERT INTO cost_events (org_id, session_id, span_id, agent_name, model, provider,
		 input_tokens, output_tokens, total_tokens, cost_cents, outcome, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		 RETURNING id, created_at`)
	if err != nil {
		return fmt.Errorf("prepare stmt: %w", err)
	}
	defer stmt.Close()

	for i := range events {
		e := &events[i]
		if err := stmt.QueryRowContext(ctx,
			e.OrgID, e.SessionID, e.SpanID, e.AgentName, e.Model, e.Provider,
			e.InputTokens, e.OutputTokens, e.TotalTokens, e.CostCents, e.Outcome, e.Metadata,
		).Scan(&e.ID, &e.CreatedAt); err != nil {
			return fmt.Errorf("insert event %d: %w", i, err)
		}
	}

	return tx.Commit()
}

// ListCostEvents returns cost events matching the given filters with pagination.
func (s *PostgresStore) ListCostEvents(ctx context.Context, orgID string, f CostEventFilter) ([]CostEvent, int64, error) {
	where := "WHERE org_id = $1"
	args := []interface{}{orgID}
	argIdx := 2

	if f.AgentName != "" {
		where += fmt.Sprintf(" AND agent_name = $%d", argIdx)
		args = append(args, f.AgentName)
		argIdx++
	}
	if f.Model != "" {
		where += fmt.Sprintf(" AND model = $%d", argIdx)
		args = append(args, f.Model)
		argIdx++
	}
	if f.Provider != "" {
		where += fmt.Sprintf(" AND provider = $%d", argIdx)
		args = append(args, f.Provider)
		argIdx++
	}
	if f.Outcome != "" {
		where += fmt.Sprintf(" AND outcome = $%d", argIdx)
		args = append(args, f.Outcome)
		argIdx++
	}
	if !f.From.IsZero() {
		where += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, f.From)
		argIdx++
	}
	if !f.To.IsZero() {
		where += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, f.To)
		argIdx++
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM cost_events %s", where)
	var total int64
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count cost events: %w", err)
	}

	// Fetch page
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	query := fmt.Sprintf(`SELECT id, org_id, session_id, span_id, agent_name, model, provider,
	          input_tokens, output_tokens, total_tokens, cost_cents, outcome, metadata, created_at
	          FROM cost_events %s
	          ORDER BY created_at DESC
	          LIMIT $%d OFFSET $%d`, where, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list cost events: %w", err)
	}
	defer rows.Close()

	var events []CostEvent
	for rows.Next() {
		var e CostEvent
		if err := rows.Scan(&e.ID, &e.OrgID, &e.SessionID, &e.SpanID, &e.AgentName,
			&e.Model, &e.Provider, &e.InputTokens, &e.OutputTokens, &e.TotalTokens,
			&e.CostCents, &e.Outcome, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan cost event: %w", err)
		}
		events = append(events, e)
	}
	if events == nil {
		events = []CostEvent{}
	}
	return events, total, rows.Err()
}

// ========================
// Cost Analytics Queries
// ========================

// GetCostSummary returns an aggregated cost summary for an organization in a date range.
func (s *PostgresStore) GetCostSummary(ctx context.Context, orgID string, from, to time.Time) (*CostSummary, error) {
	query := `SELECT
	    COALESCE(SUM(cost_cents), 0) AS total_spend_cents,
	    COUNT(*) AS total_events,
	    COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
	    COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
	    COUNT(DISTINCT model) AS unique_models,
	    COUNT(DISTINCT NULLIF(agent_name, '')) AS unique_agents
	FROM cost_events
	WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3`

	var summary CostSummary
	if err := s.db.QueryRowContext(ctx, query, orgID, from, to).Scan(
		&summary.TotalSpendCents, &summary.TotalEvents,
		&summary.TotalInputTokens, &summary.TotalOutputTokens,
		&summary.UniqueModels, &summary.UniqueAgents,
	); err != nil {
		return nil, fmt.Errorf("get cost summary: %w", err)
	}

	// Calculate average cost per session
	sessionQuery := `SELECT COUNT(DISTINCT session_id) FROM cost_events
	                 WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3 AND session_id != ''`
	var sessionCount int64
	if err := s.db.QueryRowContext(ctx, sessionQuery, orgID, from, to).Scan(&sessionCount); err != nil {
		return nil, fmt.Errorf("count sessions: %w", err)
	}
	if sessionCount > 0 {
		summary.AvgCostPerSession = summary.TotalSpendCents / sessionCount
	}

	return &summary, nil
}

// GetCostTrend returns daily cost trend data for the given date range.
func (s *PostgresStore) GetCostTrend(ctx context.Context, orgID string, from, to time.Time) ([]CostTrendPoint, error) {
	query := `SELECT
	    DATE(created_at) AS date,
	    COALESCE(SUM(cost_cents), 0) AS spend_cents,
	    COUNT(*) AS events
	FROM cost_events
	WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
	GROUP BY DATE(created_at)
	ORDER BY date`

	rows, err := s.db.QueryContext(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("get cost trend: %w", err)
	}
	defer rows.Close()

	var points []CostTrendPoint
	for rows.Next() {
		var p CostTrendPoint
		var date time.Time
		if err := rows.Scan(&date, &p.SpendCents, &p.Events); err != nil {
			return nil, fmt.Errorf("scan trend point: %w", err)
		}
		p.Date = date.Format("2006-01-02")
		points = append(points, p)
	}
	if points == nil {
		points = []CostTrendPoint{}
	}
	return points, rows.Err()
}

// GetCostByModel returns cost breakdown by model.
func (s *PostgresStore) GetCostByModel(ctx context.Context, orgID string, from, to time.Time) ([]ModelCostBreakdown, error) {
	query := `SELECT
	    model,
	    provider,
	    COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
	    COUNT(*) AS total_events,
	    COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
	    COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
	    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(cost_cents), 0) / COUNT(*) ELSE 0 END AS avg_cost_cents
	FROM cost_events
	WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
	GROUP BY model, provider
	ORDER BY total_cost_cents DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("get cost by model: %w", err)
	}
	defer rows.Close()

	var results []ModelCostBreakdown
	for rows.Next() {
		var m ModelCostBreakdown
		if err := rows.Scan(&m.Model, &m.Provider, &m.TotalCostCents, &m.TotalEvents,
			&m.TotalInputTokens, &m.TotalOutputTokens, &m.AvgCostCents); err != nil {
			return nil, fmt.Errorf("scan model cost: %w", err)
		}
		results = append(results, m)
	}
	if results == nil {
		results = []ModelCostBreakdown{}
	}
	return results, rows.Err()
}

// GetCostByAgent returns cost breakdown by agent.
func (s *PostgresStore) GetCostByAgent(ctx context.Context, orgID string, from, to time.Time) ([]AgentCostBreakdown, error) {
	query := `SELECT
	    COALESCE(NULLIF(agent_name, ''), 'unknown') AS agent_name,
	    COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
	    COUNT(*) AS total_events,
	    COALESCE(SUM(total_tokens), 0) AS total_tokens,
	    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(cost_cents), 0) / COUNT(*) ELSE 0 END AS avg_cost_cents
	FROM cost_events
	WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
	GROUP BY agent_name
	ORDER BY total_cost_cents DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("get cost by agent: %w", err)
	}
	defer rows.Close()

	var results []AgentCostBreakdown
	for rows.Next() {
		var a AgentCostBreakdown
		if err := rows.Scan(&a.AgentName, &a.TotalCostCents, &a.TotalEvents,
			&a.TotalTokens, &a.AvgCostCents); err != nil {
			return nil, fmt.Errorf("scan agent cost: %w", err)
		}
		results = append(results, a)
	}
	if results == nil {
		results = []AgentCostBreakdown{}
	}
	return results, rows.Err()
}

// GetTopSpenders returns the top spending agents and models.
func (s *PostgresStore) GetTopSpenders(ctx context.Context, orgID string, from, to time.Time, limit int) ([]TopSpender, error) {
	if limit <= 0 {
		limit = 10
	}

	// Query top agents and top models, then union and sort
	query := fmt.Sprintf(`(
	    SELECT
	        COALESCE(NULLIF(agent_name, ''), 'unknown') AS name,
	        'agent' AS type,
	        COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
	        COUNT(*) AS total_events
	    FROM cost_events
	    WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
	    GROUP BY agent_name
	) UNION ALL (
	    SELECT
	        model AS name,
	        'model' AS type,
	        COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
	        COUNT(*) AS total_events
	    FROM cost_events
	    WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
	    GROUP BY model
	)
	ORDER BY total_cost_cents DESC
	LIMIT $4`)

	rows, err := s.db.QueryContext(ctx, query, orgID, from, to, limit)
	if err != nil {
		return nil, fmt.Errorf("get top spenders: %w", err)
	}
	defer rows.Close()

	var results []TopSpender
	for rows.Next() {
		var t TopSpender
		if err := rows.Scan(&t.Name, &t.Type, &t.TotalCostCents, &t.TotalEvents); err != nil {
			return nil, fmt.Errorf("scan top spender: %w", err)
		}
		results = append(results, t)
	}
	if results == nil {
		results = []TopSpender{}
	}
	return results, rows.Err()
}

// CompareModels returns comparison data for models including pricing info.
func (s *PostgresStore) CompareModels(ctx context.Context, orgID string, from, to time.Time) ([]ModelComparison, error) {
	query := `SELECT
	    ce.model,
	    ce.provider,
	    COALESCE(SUM(ce.cost_cents), 0) AS total_cost_cents,
	    COUNT(*) AS total_events,
	    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(ce.cost_cents), 0) / COUNT(*) ELSE 0 END AS avg_cost_cents,
	    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(ce.input_tokens), 0) / COUNT(*) ELSE 0 END AS avg_input_tokens,
	    CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(ce.output_tokens), 0) / COUNT(*) ELSE 0 END AS avg_output_tokens,
	    CASE WHEN COUNT(*) > 0
	        THEN CAST(COUNT(*) FILTER (WHERE ce.outcome = 'success') AS DOUBLE PRECISION) / COUNT(*)
	        ELSE 0 END AS success_rate,
	    COALESCE(mp.input_cost_per_1m, 0) AS input_cost_per_1m,
	    COALESCE(mp.output_cost_per_1m, 0) AS output_cost_per_1m
	FROM cost_events ce
	LEFT JOIN model_pricing mp ON ce.model = mp.model AND ce.provider = mp.provider
	WHERE ce.org_id = $1 AND ce.created_at >= $2 AND ce.created_at <= $3
	GROUP BY ce.model, ce.provider, mp.input_cost_per_1m, mp.output_cost_per_1m
	ORDER BY total_cost_cents DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, from, to)
	if err != nil {
		return nil, fmt.Errorf("compare models: %w", err)
	}
	defer rows.Close()

	var results []ModelComparison
	for rows.Next() {
		var m ModelComparison
		if err := rows.Scan(&m.Model, &m.Provider, &m.TotalCostCents, &m.TotalEvents,
			&m.AvgCostCents, &m.AvgInputTokens, &m.AvgOutputTokens, &m.SuccessRate,
			&m.InputCostPer1M, &m.OutputCostPer1M); err != nil {
			return nil, fmt.Errorf("scan model comparison: %w", err)
		}
		results = append(results, m)
	}
	if results == nil {
		results = []ModelComparison{}
	}
	return results, rows.Err()
}

// ========================
// Budgets CRUD
// ========================

// ListBudgets returns all budgets for an organization.
func (s *PostgresStore) ListBudgets(ctx context.Context, orgID string) ([]Budget, error) {
	query := `SELECT id, org_id, name, description, scope, scope_value, limit_cents, period,
	          action, current_spend_cents, period_start, alert_threshold_pct, enabled,
	          created_at, updated_at
	          FROM budgets
	          WHERE org_id = $1
	          ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list budgets: %w", err)
	}
	defer rows.Close()

	var budgets []Budget
	for rows.Next() {
		var b Budget
		if err := rows.Scan(&b.ID, &b.OrgID, &b.Name, &b.Description, &b.Scope,
			&b.ScopeValue, &b.LimitCents, &b.Period, &b.Action, &b.CurrentSpendCents,
			&b.PeriodStart, &b.AlertThresholdPct, &b.Enabled, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan budget: %w", err)
		}
		budgets = append(budgets, b)
	}
	if budgets == nil {
		budgets = []Budget{}
	}
	return budgets, rows.Err()
}

// GetBudget returns a single budget by ID.
func (s *PostgresStore) GetBudget(ctx context.Context, orgID, id string) (*Budget, error) {
	query := `SELECT id, org_id, name, description, scope, scope_value, limit_cents, period,
	          action, current_spend_cents, period_start, alert_threshold_pct, enabled,
	          created_at, updated_at
	          FROM budgets
	          WHERE org_id = $1 AND id = $2`

	var b Budget
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&b.ID, &b.OrgID, &b.Name, &b.Description, &b.Scope,
		&b.ScopeValue, &b.LimitCents, &b.Period, &b.Action, &b.CurrentSpendCents,
		&b.PeriodStart, &b.AlertThresholdPct, &b.Enabled, &b.CreatedAt, &b.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get budget: %w", err)
	}
	return &b, nil
}

// CreateBudget inserts a new budget.
func (s *PostgresStore) CreateBudget(ctx context.Context, b *Budget) error {
	query := `INSERT INTO budgets (org_id, name, description, scope, scope_value, limit_cents,
	          period, action, alert_threshold_pct, enabled)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	          RETURNING id, current_spend_cents, period_start, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		b.OrgID, b.Name, b.Description, b.Scope, b.ScopeValue, b.LimitCents,
		b.Period, b.Action, b.AlertThresholdPct, b.Enabled,
	).Scan(&b.ID, &b.CurrentSpendCents, &b.PeriodStart, &b.CreatedAt, &b.UpdatedAt)
}

// UpdateBudget updates an existing budget.
func (s *PostgresStore) UpdateBudget(ctx context.Context, b *Budget) error {
	query := `UPDATE budgets SET name = $1, description = $2, scope = $3, scope_value = $4,
	          limit_cents = $5, period = $6, action = $7, alert_threshold_pct = $8,
	          enabled = $9, updated_at = NOW()
	          WHERE org_id = $10 AND id = $11
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		b.Name, b.Description, b.Scope, b.ScopeValue, b.LimitCents,
		b.Period, b.Action, b.AlertThresholdPct, b.Enabled,
		b.OrgID, b.ID,
	).Scan(&b.UpdatedAt)
}

// DeleteBudget removes a budget.
func (s *PostgresStore) DeleteBudget(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM budgets WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete budget: %w", err)
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

// ListEnabledBudgets returns all enabled budgets across all organizations.
func (s *PostgresStore) ListEnabledBudgets(ctx context.Context) ([]Budget, error) {
	query := `SELECT id, org_id, name, description, scope, scope_value, limit_cents, period,
	          action, current_spend_cents, period_start, alert_threshold_pct, enabled,
	          created_at, updated_at
	          FROM budgets
	          WHERE enabled = TRUE
	          ORDER BY org_id, created_at`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list enabled budgets: %w", err)
	}
	defer rows.Close()

	var budgets []Budget
	for rows.Next() {
		var b Budget
		if err := rows.Scan(&b.ID, &b.OrgID, &b.Name, &b.Description, &b.Scope,
			&b.ScopeValue, &b.LimitCents, &b.Period, &b.Action, &b.CurrentSpendCents,
			&b.PeriodStart, &b.AlertThresholdPct, &b.Enabled, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan budget: %w", err)
		}
		budgets = append(budgets, b)
	}
	if budgets == nil {
		budgets = []Budget{}
	}
	return budgets, rows.Err()
}

// UpdateBudgetSpend sets the current_spend_cents for a budget.
func (s *PostgresStore) UpdateBudgetSpend(ctx context.Context, budgetID string, spendCents int) error {
	query := `UPDATE budgets SET current_spend_cents = $1, updated_at = NOW() WHERE id = $2`
	_, err := s.db.ExecContext(ctx, query, spendCents, budgetID)
	if err != nil {
		return fmt.Errorf("update budget spend: %w", err)
	}
	return nil
}

// ResetBudgetPeriod resets the spend and advances the period_start for a budget.
func (s *PostgresStore) ResetBudgetPeriod(ctx context.Context, budgetID string, newPeriodStart time.Time) error {
	query := `UPDATE budgets SET current_spend_cents = 0, period_start = $1, updated_at = NOW() WHERE id = $2`
	_, err := s.db.ExecContext(ctx, query, newPeriodStart, budgetID)
	if err != nil {
		return fmt.Errorf("reset budget period: %w", err)
	}
	return nil
}

// GetBudgetSpendFromEvents calculates the total spend for a budget scope from cost_events
// within the budget's period.
func (s *PostgresStore) GetBudgetSpendFromEvents(ctx context.Context, b *Budget) (int, error) {
	where := "WHERE org_id = $1 AND created_at >= $2"
	args := []interface{}{b.OrgID, b.PeriodStart}
	argIdx := 3

	switch b.Scope {
	case "agent":
		if b.ScopeValue != "" {
			where += fmt.Sprintf(" AND agent_name = $%d", argIdx)
			args = append(args, b.ScopeValue)
		}
	case "model":
		if b.ScopeValue != "" {
			where += fmt.Sprintf(" AND model = $%d", argIdx)
			args = append(args, b.ScopeValue)
		}
	}

	query := fmt.Sprintf("SELECT COALESCE(SUM(cost_cents), 0) FROM cost_events %s", where)
	var spend int
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&spend); err != nil {
		return 0, fmt.Errorf("get budget spend: %w", err)
	}
	return spend, nil
}

// ========================
// Model Pricing CRUD
// ========================

// ListModelPricing returns all model pricing entries.
func (s *PostgresStore) ListModelPricing(ctx context.Context) ([]ModelPricing, error) {
	query := `SELECT id, provider, model, input_cost_per_1m, output_cost_per_1m, updated_at
	          FROM model_pricing
	          ORDER BY provider, model`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list model pricing: %w", err)
	}
	defer rows.Close()

	var pricing []ModelPricing
	for rows.Next() {
		var p ModelPricing
		if err := rows.Scan(&p.ID, &p.Provider, &p.Model, &p.InputCostPer1M,
			&p.OutputCostPer1M, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan model pricing: %w", err)
		}
		pricing = append(pricing, p)
	}
	if pricing == nil {
		pricing = []ModelPricing{}
	}
	return pricing, rows.Err()
}

// UpsertModelPricing inserts or updates model pricing.
func (s *PostgresStore) UpsertModelPricing(ctx context.Context, p *ModelPricing) error {
	query := `INSERT INTO model_pricing (provider, model, input_cost_per_1m, output_cost_per_1m)
	          VALUES ($1, $2, $3, $4)
	          ON CONFLICT (provider, model) DO UPDATE SET
	            input_cost_per_1m = EXCLUDED.input_cost_per_1m,
	            output_cost_per_1m = EXCLUDED.output_cost_per_1m,
	            updated_at = NOW()
	          RETURNING id, updated_at`

	return s.db.QueryRowContext(ctx, query,
		p.Provider, p.Model, p.InputCostPer1M, p.OutputCostPer1M,
	).Scan(&p.ID, &p.UpdatedAt)
}

// GetModelPricing returns pricing for a specific provider/model combination.
func (s *PostgresStore) GetModelPricing(ctx context.Context, provider, model string) (*ModelPricing, error) {
	query := `SELECT id, provider, model, input_cost_per_1m, output_cost_per_1m, updated_at
	          FROM model_pricing WHERE provider = $1 AND model = $2`

	var p ModelPricing
	err := s.db.QueryRowContext(ctx, query, provider, model).Scan(
		&p.ID, &p.Provider, &p.Model, &p.InputCostPer1M, &p.OutputCostPer1M, &p.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get model pricing: %w", err)
	}
	return &p, nil
}

// DeleteExpiredCacheEntries removes expired semantic cache entries.
// This is used by the cache cleanup worker.
func (s *PostgresStore) DeleteExpiredCacheEntries(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM cache_entries WHERE expires_at < NOW()`)
	if err != nil {
		return 0, fmt.Errorf("delete expired cache entries: %w", err)
	}
	return result.RowsAffected()
}
