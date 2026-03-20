package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/trace/store"
)

const (
	patternMatchInterval  = 30 * time.Second
	patternLookbackWindow = 5 * time.Minute
	maxSpansThreshold     = 50
)

// PatternMatcher periodically queries recent sessions from ClickHouse and
// matches them against failure patterns stored in PostgreSQL.
type PatternMatcher struct {
	chDB   *sql.DB
	pgDB   *sql.DB
	logger *slog.Logger
	done   chan struct{}
}

// NewPatternMatcher creates a new pattern matcher worker.
func NewPatternMatcher(chDB, pgDB *sql.DB, logger *slog.Logger) *PatternMatcher {
	return &PatternMatcher{
		chDB:   chDB,
		pgDB:   pgDB,
		logger: logger,
		done:   make(chan struct{}),
	}
}

// Start begins the periodic pattern matching loop.
func (pm *PatternMatcher) Start() {
	pm.logger.Info("pattern matcher started", "interval", patternMatchInterval)
	go pm.loop()
}

// Stop terminates the pattern matching loop.
func (pm *PatternMatcher) Stop() {
	close(pm.done)
	pm.logger.Info("pattern matcher stopped")
}

func (pm *PatternMatcher) loop() {
	ticker := time.NewTicker(patternMatchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			pm.run()
		case <-pm.done:
			return
		}
	}
}

func (pm *PatternMatcher) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Fetch enabled patterns from PostgreSQL
	patterns, err := pm.loadEnabledPatterns(ctx)
	if err != nil {
		pm.logger.Error("failed to load patterns", "error", err)
		return
	}
	if len(patterns) == 0 {
		return
	}

	// Fetch recent sessions from ClickHouse
	sessions, err := pm.loadRecentSessions(ctx)
	if err != nil {
		pm.logger.Error("failed to load recent sessions", "error", err)
		return
	}
	if len(sessions) == 0 {
		return
	}

	// Match sessions against patterns
	matches := 0
	for _, sess := range sessions {
		for _, pattern := range patterns {
			if pm.matchPattern(sess, pattern) {
				matches++
				pm.logger.Info("pattern match detected",
					"session_id", sess.ID,
					"pattern_id", pattern.ID,
					"pattern_name", pattern.Name,
					"category", pattern.Category,
					"severity", pattern.Severity,
				)
			}
		}
	}

	if matches > 0 {
		pm.logger.Info("pattern matching cycle complete", "sessions", len(sessions), "patterns", len(patterns), "matches", matches)
	}
}

func (pm *PatternMatcher) loadEnabledPatterns(ctx context.Context) ([]store.FailurePattern, error) {
	query := `SELECT id, org_id, name, description, category, detection_rules,
	                 severity, is_builtin, enabled, created_at, updated_at
	          FROM failure_patterns WHERE enabled = true`

	rows, err := pm.pgDB.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query patterns: %w", err)
	}
	defer rows.Close()

	var patterns []store.FailurePattern
	for rows.Next() {
		var p store.FailurePattern
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Description,
			&p.Category, &p.DetectionRules, &p.Severity, &p.IsBuiltin,
			&p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan pattern: %w", err)
		}
		patterns = append(patterns, p)
	}
	return patterns, rows.Err()
}

func (pm *PatternMatcher) loadRecentSessions(ctx context.Context) ([]store.Session, error) {
	cutoff := time.Now().UTC().Add(-patternLookbackWindow)

	query := `SELECT id, org_id, agent_name, agent_id, status, input, output, error,
	                 metadata, total_tokens, total_cost_cents, total_spans, duration_ms,
	                 has_healing, tags, started_at, ended_at, created_at
	          FROM agentstack.sessions
	          WHERE started_at >= ?
	          ORDER BY started_at DESC
	          LIMIT 500`

	rows, err := pm.chDB.QueryContext(ctx, query, cutoff)
	if err != nil {
		return nil, fmt.Errorf("query sessions: %w", err)
	}
	defer rows.Close()

	var sessions []store.Session
	for rows.Next() {
		var sess store.Session
		var hasHealing uint8
		var tags []string
		if err := rows.Scan(
			&sess.ID, &sess.OrgID, &sess.AgentName, &sess.AgentID,
			&sess.Status, &sess.Input, &sess.Output, &sess.Error,
			&sess.Metadata, &sess.TotalTokens, &sess.TotalCostCents,
			&sess.TotalSpans, &sess.DurationMs, &hasHealing,
			&tags, &sess.StartedAt, &sess.EndedAt, &sess.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sess.HasHealing = hasHealing == 1
		sess.Tags = tags
		if sess.Tags == nil {
			sess.Tags = []string{}
		}
		sessions = append(sessions, sess)
	}
	return sessions, rows.Err()
}

// matchPattern checks whether a session matches a given failure pattern.
// This implements simple detection logic based on pattern category and detection rules.
func (pm *PatternMatcher) matchPattern(sess store.Session, pattern store.FailurePattern) bool {
	var rules DetectionRules
	if err := json.Unmarshal(pattern.DetectionRules, &rules); err != nil {
		pm.logger.Warn("failed to parse detection rules", "pattern_id", pattern.ID, "error", err)
		return false
	}

	switch pattern.Category {
	case "error":
		return pm.matchErrorPattern(sess, rules)
	case "loop":
		return pm.matchLoopPattern(sess, rules)
	case "timeout":
		return pm.matchTimeoutPattern(sess, rules)
	case "cost":
		return pm.matchCostPattern(sess, rules)
	case "hallucination":
		return pm.matchHallucinationPattern(sess, rules)
	default:
		return pm.matchGenericPattern(sess, rules)
	}
}

// DetectionRules represents the JSON structure of pattern detection_rules.
type DetectionRules struct {
	// Error patterns
	HasError     bool   `json:"has_error"`
	ErrorContains string `json:"error_contains"`

	// Loop patterns
	MinSpans     uint32 `json:"min_spans"`
	MaxSpans     uint32 `json:"max_spans"`

	// Timeout patterns
	MinDurationMs uint64 `json:"min_duration_ms"`

	// Cost patterns
	MaxCostCents uint64 `json:"max_cost_cents"`
	MaxTokens    uint64 `json:"max_tokens"`

	// Status check
	Status string `json:"status"`
}

func (pm *PatternMatcher) matchErrorPattern(sess store.Session, rules DetectionRules) bool {
	if rules.HasError && sess.Error != "" {
		if rules.ErrorContains != "" {
			return containsSubstring(sess.Error, rules.ErrorContains)
		}
		return true
	}
	if rules.Status != "" && sess.Status == rules.Status {
		return true
	}
	return false
}

func (pm *PatternMatcher) matchLoopPattern(sess store.Session, rules DetectionRules) bool {
	if rules.MaxSpans > 0 && sess.TotalSpans > rules.MaxSpans {
		return true
	}
	if rules.MinSpans > 0 && sess.TotalSpans >= rules.MinSpans {
		return true
	}
	// Default: excessive spans indicates a potential loop
	if rules.MaxSpans == 0 && rules.MinSpans == 0 && sess.TotalSpans > maxSpansThreshold {
		return true
	}
	return false
}

func (pm *PatternMatcher) matchTimeoutPattern(sess store.Session, rules DetectionRules) bool {
	if sess.Status == "timeout" {
		return true
	}
	if rules.MinDurationMs > 0 && sess.DurationMs >= rules.MinDurationMs {
		return true
	}
	return false
}

func (pm *PatternMatcher) matchCostPattern(sess store.Session, rules DetectionRules) bool {
	if rules.MaxCostCents > 0 && sess.TotalCostCents > rules.MaxCostCents {
		return true
	}
	if rules.MaxTokens > 0 && sess.TotalTokens > rules.MaxTokens {
		return true
	}
	return false
}

func (pm *PatternMatcher) matchHallucinationPattern(sess store.Session, rules DetectionRules) bool {
	// Simple heuristic: sessions that failed with error text containing hallucination signals
	if sess.Status == "failed" && sess.Error != "" {
		hallucSignals := []string{
			"tool not found", "invalid function", "does not exist",
			"no such", "undefined", "hallucin",
		}
		for _, signal := range hallucSignals {
			if containsSubstring(sess.Error, signal) {
				return true
			}
		}
	}
	return false
}

func (pm *PatternMatcher) matchGenericPattern(sess store.Session, rules DetectionRules) bool {
	if rules.HasError && sess.Error != "" {
		return true
	}
	if rules.Status != "" && sess.Status == rules.Status {
		return true
	}
	return false
}

// containsSubstring performs a case-insensitive substring search.
func containsSubstring(s, substr string) bool {
	sLower := toLower(s)
	substrLower := toLower(substr)
	return len(substrLower) <= len(sLower) && indexOf(sLower, substrLower) >= 0
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
