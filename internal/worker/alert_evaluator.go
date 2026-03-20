package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

const (
	alertEvalInterval  = 60 * time.Second
	alertLookbackWindow = 5 * time.Minute
)

// AlertEvaluator periodically evaluates alert rules from PostgreSQL against
// ClickHouse trace data and creates alert_events when thresholds are crossed.
type AlertEvaluator struct {
	chDB   *sql.DB
	pgDB   *sql.DB
	logger *slog.Logger
	done   chan struct{}
}

// NewAlertEvaluator creates a new alert evaluator worker.
func NewAlertEvaluator(chDB, pgDB *sql.DB, logger *slog.Logger) *AlertEvaluator {
	return &AlertEvaluator{
		chDB:   chDB,
		pgDB:   pgDB,
		logger: logger,
		done:   make(chan struct{}),
	}
}

// Start begins the periodic alert evaluation loop.
func (ae *AlertEvaluator) Start() {
	ae.logger.Info("alert evaluator started", "interval", alertEvalInterval)
	go ae.loop()
}

// Stop terminates the alert evaluation loop.
func (ae *AlertEvaluator) Stop() {
	close(ae.done)
	ae.logger.Info("alert evaluator stopped")
}

func (ae *AlertEvaluator) loop() {
	ticker := time.NewTicker(alertEvalInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ae.run()
		case <-ae.done:
			return
		}
	}
}

// alertRule mirrors the alert_rules table for the evaluator.
type alertRule struct {
	ID              string
	OrgID           string
	Name            string
	ConditionType   string
	ConditionConfig json.RawMessage
	Enabled         bool
	LastTriggeredAt *time.Time
}

// alertConditionConfig represents the JSON config for an alert rule condition.
type alertConditionConfig struct {
	// Threshold conditions
	Metric    string  `json:"metric"`    // failure_rate, avg_cost, avg_duration, total_tokens, error_count
	Operator  string  `json:"operator"`  // gt, lt, gte, lte, eq
	Value     float64 `json:"value"`

	// Pattern conditions
	PatternCategory string `json:"pattern_category"` // loop, hallucination, timeout, error, cost
	MinMatches       int    `json:"min_matches"`

	// Time window
	WindowMinutes int `json:"window_minutes"` // lookback window, defaults to 5
}

func (ae *AlertEvaluator) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rules, err := ae.loadEnabledRules(ctx)
	if err != nil {
		ae.logger.Error("failed to load alert rules", "error", err)
		return
	}
	if len(rules) == 0 {
		return
	}

	triggered := 0
	for _, rule := range rules {
		matched, details, err := ae.evaluateRule(ctx, rule)
		if err != nil {
			ae.logger.Error("failed to evaluate alert rule", "rule_id", rule.ID, "error", err)
			continue
		}

		if matched {
			if err := ae.createAlertEvent(ctx, rule, details); err != nil {
				ae.logger.Error("failed to create alert event", "rule_id", rule.ID, "error", err)
				continue
			}
			triggered++
			ae.logger.Info("alert triggered",
				"rule_id", rule.ID,
				"rule_name", rule.Name,
				"org_id", rule.OrgID,
				"details", string(details),
			)
		}
	}

	if triggered > 0 {
		ae.logger.Info("alert evaluation cycle complete", "rules", len(rules), "triggered", triggered)
	}
}

func (ae *AlertEvaluator) loadEnabledRules(ctx context.Context) ([]alertRule, error) {
	query := `SELECT id, org_id, name, condition_type, condition_config, enabled, last_triggered_at
	          FROM alert_rules WHERE enabled = true`

	rows, err := ae.pgDB.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query alert rules: %w", err)
	}
	defer rows.Close()

	var rules []alertRule
	for rows.Next() {
		var r alertRule
		if err := rows.Scan(&r.ID, &r.OrgID, &r.Name, &r.ConditionType,
			&r.ConditionConfig, &r.Enabled, &r.LastTriggeredAt); err != nil {
			return nil, fmt.Errorf("scan alert rule: %w", err)
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

func (ae *AlertEvaluator) evaluateRule(ctx context.Context, rule alertRule) (bool, json.RawMessage, error) {
	var cfg alertConditionConfig
	if err := json.Unmarshal(rule.ConditionConfig, &cfg); err != nil {
		return false, nil, fmt.Errorf("parse condition config: %w", err)
	}

	switch rule.ConditionType {
	case "threshold":
		return ae.evaluateThreshold(ctx, rule.OrgID, cfg)
	case "pattern":
		return ae.evaluatePattern(ctx, rule.OrgID, cfg)
	default:
		return false, nil, fmt.Errorf("unknown condition type: %s", rule.ConditionType)
	}
}

func (ae *AlertEvaluator) evaluateThreshold(ctx context.Context, orgID string, cfg alertConditionConfig) (bool, json.RawMessage, error) {
	windowMinutes := cfg.WindowMinutes
	if windowMinutes <= 0 {
		windowMinutes = 5
	}
	cutoff := time.Now().UTC().Add(-time.Duration(windowMinutes) * time.Minute)

	var metricValue float64
	var err error

	switch cfg.Metric {
	case "failure_rate":
		metricValue, err = ae.queryFailureRate(ctx, orgID, cutoff)
	case "avg_cost":
		metricValue, err = ae.queryAvgCost(ctx, orgID, cutoff)
	case "avg_duration":
		metricValue, err = ae.queryAvgDuration(ctx, orgID, cutoff)
	case "total_tokens":
		metricValue, err = ae.queryTotalTokens(ctx, orgID, cutoff)
	case "error_count":
		metricValue, err = ae.queryErrorCount(ctx, orgID, cutoff)
	default:
		return false, nil, fmt.Errorf("unknown metric: %s", cfg.Metric)
	}
	if err != nil {
		return false, nil, err
	}

	matched := compareValues(metricValue, cfg.Operator, cfg.Value)
	if matched {
		details, _ := json.Marshal(map[string]interface{}{
			"metric":        cfg.Metric,
			"operator":      cfg.Operator,
			"threshold":     cfg.Value,
			"actual_value":  metricValue,
			"window_minutes": windowMinutes,
		})
		return true, details, nil
	}
	return false, nil, nil
}

func (ae *AlertEvaluator) evaluatePattern(ctx context.Context, orgID string, cfg alertConditionConfig) (bool, json.RawMessage, error) {
	windowMinutes := cfg.WindowMinutes
	if windowMinutes <= 0 {
		windowMinutes = 5
	}
	cutoff := time.Now().UTC().Add(-time.Duration(windowMinutes) * time.Minute)

	// Count sessions that match the pattern category criteria
	var count int
	switch cfg.PatternCategory {
	case "error":
		query := `SELECT count() FROM agentstack.sessions
		          WHERE org_id = ? AND started_at >= ? AND status = 'failed'`
		err := ae.chDB.QueryRowContext(ctx, query, orgID, cutoff).Scan(&count)
		if err != nil {
			return false, nil, fmt.Errorf("query error pattern: %w", err)
		}
	case "loop":
		query := `SELECT count() FROM agentstack.sessions
		          WHERE org_id = ? AND started_at >= ? AND total_spans > 50`
		err := ae.chDB.QueryRowContext(ctx, query, orgID, cutoff).Scan(&count)
		if err != nil {
			return false, nil, fmt.Errorf("query loop pattern: %w", err)
		}
	case "timeout":
		query := `SELECT count() FROM agentstack.sessions
		          WHERE org_id = ? AND started_at >= ? AND status = 'timeout'`
		err := ae.chDB.QueryRowContext(ctx, query, orgID, cutoff).Scan(&count)
		if err != nil {
			return false, nil, fmt.Errorf("query timeout pattern: %w", err)
		}
	case "cost":
		query := `SELECT count() FROM agentstack.sessions
		          WHERE org_id = ? AND started_at >= ? AND total_cost_cents > 1000`
		err := ae.chDB.QueryRowContext(ctx, query, orgID, cutoff).Scan(&count)
		if err != nil {
			return false, nil, fmt.Errorf("query cost pattern: %w", err)
		}
	case "hallucination":
		query := `SELECT count() FROM agentstack.sessions
		          WHERE org_id = ? AND started_at >= ? AND status = 'failed'
		          AND (error LIKE '%tool not found%' OR error LIKE '%invalid function%'
		               OR error LIKE '%does not exist%' OR error LIKE '%hallucin%')`
		err := ae.chDB.QueryRowContext(ctx, query, orgID, cutoff).Scan(&count)
		if err != nil {
			return false, nil, fmt.Errorf("query hallucination pattern: %w", err)
		}
	default:
		return false, nil, nil
	}

	minMatches := cfg.MinMatches
	if minMatches <= 0 {
		minMatches = 1
	}

	if count >= minMatches {
		details, _ := json.Marshal(map[string]interface{}{
			"pattern_category": cfg.PatternCategory,
			"min_matches":      minMatches,
			"actual_matches":   count,
			"window_minutes":   windowMinutes,
		})
		return true, details, nil
	}

	return false, nil, nil
}

func (ae *AlertEvaluator) queryFailureRate(ctx context.Context, orgID string, since time.Time) (float64, error) {
	query := `SELECT if(count() > 0, countIf(status = 'failed') / count(), 0)
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ?`
	var rate float64
	err := ae.chDB.QueryRowContext(ctx, query, orgID, since).Scan(&rate)
	return rate, err
}

func (ae *AlertEvaluator) queryAvgCost(ctx context.Context, orgID string, since time.Time) (float64, error) {
	query := `SELECT if(count() > 0, avg(total_cost_cents), 0)
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ?`
	var avg float64
	err := ae.chDB.QueryRowContext(ctx, query, orgID, since).Scan(&avg)
	return avg, err
}

func (ae *AlertEvaluator) queryAvgDuration(ctx context.Context, orgID string, since time.Time) (float64, error) {
	query := `SELECT if(count() > 0, avg(duration_ms), 0)
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ?`
	var avg float64
	err := ae.chDB.QueryRowContext(ctx, query, orgID, since).Scan(&avg)
	return avg, err
}

func (ae *AlertEvaluator) queryTotalTokens(ctx context.Context, orgID string, since time.Time) (float64, error) {
	query := `SELECT sum(total_tokens)
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ?`
	var total float64
	err := ae.chDB.QueryRowContext(ctx, query, orgID, since).Scan(&total)
	return total, err
}

func (ae *AlertEvaluator) queryErrorCount(ctx context.Context, orgID string, since time.Time) (float64, error) {
	query := `SELECT countIf(status = 'failed')
	          FROM agentstack.sessions
	          WHERE org_id = ? AND started_at >= ?`
	var count float64
	err := ae.chDB.QueryRowContext(ctx, query, orgID, since).Scan(&count)
	return count, err
}

func (ae *AlertEvaluator) createAlertEvent(ctx context.Context, rule alertRule, details json.RawMessage) error {
	// Insert alert event into PostgreSQL
	query := `INSERT INTO alert_events (org_id, rule_id, status, details)
	          VALUES ($1, $2, 'triggered', $3)`
	_, err := ae.pgDB.ExecContext(ctx, query, rule.OrgID, rule.ID, details)
	if err != nil {
		return fmt.Errorf("insert alert event: %w", err)
	}

	// Update last_triggered_at on the rule
	updateQuery := `UPDATE alert_rules SET last_triggered_at = NOW() WHERE id = $1`
	_, err = ae.pgDB.ExecContext(ctx, updateQuery, rule.ID)
	if err != nil {
		ae.logger.Warn("failed to update last_triggered_at", "rule_id", rule.ID, "error", err)
	}

	return nil
}

// compareValues evaluates whether actual <op> threshold is true.
func compareValues(actual float64, operator string, threshold float64) bool {
	switch operator {
	case "gt":
		return actual > threshold
	case "lt":
		return actual < threshold
	case "gte":
		return actual >= threshold
	case "lte":
		return actual <= threshold
	case "eq":
		return actual == threshold
	default:
		return false
	}
}
