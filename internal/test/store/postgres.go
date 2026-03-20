// Package store provides PostgreSQL CRUD operations for the Test module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PostgresStore provides CRUD access to test data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Test module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// DB returns the underlying database connection for direct queries.
func (s *PostgresStore) DB() *sql.DB {
	return s.db
}

// --- Domain Structs ---

// TestSuite represents a collection of test cases.
type TestSuite struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AgentID     *string   `json:"agent_id,omitempty"`
	Tags        []string  `json:"tags"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`

	// Computed fields
	CaseCount int `json:"case_count,omitempty"`
}

// TestCase represents an individual test scenario within a suite.
type TestCase struct {
	ID                 string          `json:"id"`
	SuiteID            string          `json:"suite_id"`
	OrgID              string          `json:"org_id"`
	Name               string          `json:"name"`
	Description        string          `json:"description"`
	Input              json.RawMessage `json:"input"`
	ExpectedOutput     json.RawMessage `json:"expected_output,omitempty"`
	Context            json.RawMessage `json:"context"`
	EvaluatorIDs       []string        `json:"evaluator_ids"`
	Tags               []string        `json:"tags"`
	CreatedFromSession *string         `json:"created_from_session,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// Evaluator represents an evaluator configuration.
type Evaluator struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Type        string          `json:"type"`
	Subtype     string          `json:"subtype"`
	Config      json.RawMessage `json:"config"`
	IsBuiltin   bool            `json:"is_builtin"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// TestRun represents an execution of a test suite.
type TestRun struct {
	ID          string          `json:"id"`
	OrgID       string          `json:"org_id"`
	SuiteID     string          `json:"suite_id"`
	Status      string          `json:"status"`
	TotalCases  int             `json:"total_cases"`
	PassedCases int             `json:"passed_cases"`
	FailedCases int             `json:"failed_cases"`
	ErrorCases  int             `json:"error_cases"`
	AvgScore    float64         `json:"avg_score"`
	DurationMs  int64           `json:"duration_ms"`
	Metadata    json.RawMessage `json:"metadata"`
	StartedAt   *time.Time      `json:"started_at,omitempty"`
	CompletedAt *time.Time      `json:"completed_at,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`

	// Populated on detail queries
	Results []TestRunResult `json:"results,omitempty"`
}

// TestRunResult represents the result for a single test case in a run.
type TestRunResult struct {
	ID           string          `json:"id"`
	RunID        string          `json:"run_id"`
	CaseID       string          `json:"case_id"`
	Status       string          `json:"status"`
	ActualOutput json.RawMessage `json:"actual_output,omitempty"`
	Scores       json.RawMessage `json:"scores"`
	Details      json.RawMessage `json:"details"`
	DurationMs   int64           `json:"duration_ms"`
	CreatedAt    time.Time       `json:"created_at"`
}

// ===========================
// Test Suites
// ===========================

// ListTestSuites returns all test suites for an organization.
func (s *PostgresStore) ListTestSuites(ctx context.Context, orgID string) ([]TestSuite, error) {
	query := `SELECT ts.id, ts.org_id, ts.name, ts.description, ts.agent_id,
	                 ts.tags, ts.created_at, ts.updated_at,
	                 COALESCE((SELECT COUNT(*) FROM test_cases tc WHERE tc.suite_id = ts.id), 0) AS case_count
	          FROM test_suites ts
	          WHERE ts.org_id = $1
	          ORDER BY ts.created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list test suites: %w", err)
	}
	defer rows.Close()

	var suites []TestSuite
	for rows.Next() {
		var suite TestSuite
		var tags string
		if err := rows.Scan(&suite.ID, &suite.OrgID, &suite.Name, &suite.Description,
			&suite.AgentID, &tags, &suite.CreatedAt, &suite.UpdatedAt,
			&suite.CaseCount); err != nil {
			return nil, fmt.Errorf("scan test suite: %w", err)
		}
		suite.Tags = pgArrayToSlice(tags)
		suites = append(suites, suite)
	}
	if suites == nil {
		suites = []TestSuite{}
	}
	return suites, rows.Err()
}

// GetTestSuite returns a single test suite with its case count.
func (s *PostgresStore) GetTestSuite(ctx context.Context, orgID, id string) (*TestSuite, error) {
	query := `SELECT ts.id, ts.org_id, ts.name, ts.description, ts.agent_id,
	                 ts.tags, ts.created_at, ts.updated_at,
	                 COALESCE((SELECT COUNT(*) FROM test_cases tc WHERE tc.suite_id = ts.id), 0) AS case_count
	          FROM test_suites ts
	          WHERE ts.org_id = $1 AND ts.id = $2`

	var suite TestSuite
	var tags string
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&suite.ID, &suite.OrgID, &suite.Name, &suite.Description,
		&suite.AgentID, &tags, &suite.CreatedAt, &suite.UpdatedAt,
		&suite.CaseCount,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get test suite: %w", err)
	}
	suite.Tags = pgArrayToSlice(tags)
	return &suite, nil
}

// CreateTestSuite inserts a new test suite.
func (s *PostgresStore) CreateTestSuite(ctx context.Context, suite *TestSuite) error {
	query := `INSERT INTO test_suites (org_id, name, description, agent_id, tags)
	          VALUES ($1, $2, $3, $4, $5)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		suite.OrgID, suite.Name, suite.Description, suite.AgentID,
		sliceToPGArray(suite.Tags),
	).Scan(&suite.ID, &suite.CreatedAt, &suite.UpdatedAt)
}

// UpdateTestSuite updates an existing test suite.
func (s *PostgresStore) UpdateTestSuite(ctx context.Context, suite *TestSuite) error {
	query := `UPDATE test_suites SET name = $1, description = $2, agent_id = $3,
	          tags = $4, updated_at = NOW()
	          WHERE org_id = $5 AND id = $6
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		suite.Name, suite.Description, suite.AgentID,
		sliceToPGArray(suite.Tags), suite.OrgID, suite.ID,
	).Scan(&suite.UpdatedAt)
}

// DeleteTestSuite removes a test suite and cascades to cases and runs.
func (s *PostgresStore) DeleteTestSuite(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM test_suites WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete test suite: %w", err)
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
// Test Cases
// ===========================

// ListTestCases returns all test cases for a suite.
func (s *PostgresStore) ListTestCases(ctx context.Context, orgID, suiteID string) ([]TestCase, error) {
	query := `SELECT id, suite_id, org_id, name, description, input, expected_output,
	                 context, evaluator_ids, tags, created_from_session,
	                 created_at, updated_at
	          FROM test_cases
	          WHERE org_id = $1 AND suite_id = $2
	          ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID, suiteID)
	if err != nil {
		return nil, fmt.Errorf("list test cases: %w", err)
	}
	defer rows.Close()

	var cases []TestCase
	for rows.Next() {
		var tc TestCase
		var tags, evalIDs string
		if err := rows.Scan(&tc.ID, &tc.SuiteID, &tc.OrgID, &tc.Name, &tc.Description,
			&tc.Input, &tc.ExpectedOutput, &tc.Context, &evalIDs, &tags,
			&tc.CreatedFromSession, &tc.CreatedAt, &tc.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan test case: %w", err)
		}
		tc.Tags = pgArrayToSlice(tags)
		tc.EvaluatorIDs = pgArrayToSlice(evalIDs)
		cases = append(cases, tc)
	}
	if cases == nil {
		cases = []TestCase{}
	}
	return cases, rows.Err()
}

// GetTestCase returns a single test case by ID.
func (s *PostgresStore) GetTestCase(ctx context.Context, orgID, id string) (*TestCase, error) {
	query := `SELECT id, suite_id, org_id, name, description, input, expected_output,
	                 context, evaluator_ids, tags, created_from_session,
	                 created_at, updated_at
	          FROM test_cases
	          WHERE org_id = $1 AND id = $2`

	var tc TestCase
	var tags, evalIDs string
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&tc.ID, &tc.SuiteID, &tc.OrgID, &tc.Name, &tc.Description,
		&tc.Input, &tc.ExpectedOutput, &tc.Context, &evalIDs, &tags,
		&tc.CreatedFromSession, &tc.CreatedAt, &tc.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get test case: %w", err)
	}
	tc.Tags = pgArrayToSlice(tags)
	tc.EvaluatorIDs = pgArrayToSlice(evalIDs)
	return &tc, nil
}

// CreateTestCase inserts a new test case.
func (s *PostgresStore) CreateTestCase(ctx context.Context, tc *TestCase) error {
	query := `INSERT INTO test_cases (suite_id, org_id, name, description, input,
	          expected_output, context, evaluator_ids, tags, created_from_session)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		tc.SuiteID, tc.OrgID, tc.Name, tc.Description, tc.Input,
		tc.ExpectedOutput, tc.Context, sliceToPGArray(tc.EvaluatorIDs),
		sliceToPGArray(tc.Tags), tc.CreatedFromSession,
	).Scan(&tc.ID, &tc.CreatedAt, &tc.UpdatedAt)
}

// UpdateTestCase updates an existing test case.
func (s *PostgresStore) UpdateTestCase(ctx context.Context, tc *TestCase) error {
	query := `UPDATE test_cases SET name = $1, description = $2, input = $3,
	          expected_output = $4, context = $5, evaluator_ids = $6,
	          tags = $7, updated_at = NOW()
	          WHERE org_id = $8 AND id = $9
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		tc.Name, tc.Description, tc.Input, tc.ExpectedOutput,
		tc.Context, sliceToPGArray(tc.EvaluatorIDs),
		sliceToPGArray(tc.Tags), tc.OrgID, tc.ID,
	).Scan(&tc.UpdatedAt)
}

// DeleteTestCase removes a test case.
func (s *PostgresStore) DeleteTestCase(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM test_cases WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete test case: %w", err)
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
// Evaluators
// ===========================

// ListEvaluators returns all evaluators for an organization (including builtins).
func (s *PostgresStore) ListEvaluators(ctx context.Context, orgID string) ([]Evaluator, error) {
	query := `SELECT id, org_id, name, description, type, subtype, config,
	                 is_builtin, created_at, updated_at
	          FROM evaluators
	          WHERE org_id = $1 OR is_builtin = true
	          ORDER BY is_builtin DESC, created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list evaluators: %w", err)
	}
	defer rows.Close()

	var evals []Evaluator
	for rows.Next() {
		var e Evaluator
		if err := rows.Scan(&e.ID, &e.OrgID, &e.Name, &e.Description,
			&e.Type, &e.Subtype, &e.Config, &e.IsBuiltin,
			&e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan evaluator: %w", err)
		}
		evals = append(evals, e)
	}
	if evals == nil {
		evals = []Evaluator{}
	}
	return evals, rows.Err()
}

// GetEvaluator returns a single evaluator by ID.
func (s *PostgresStore) GetEvaluator(ctx context.Context, orgID, id string) (*Evaluator, error) {
	query := `SELECT id, org_id, name, description, type, subtype, config,
	                 is_builtin, created_at, updated_at
	          FROM evaluators
	          WHERE (org_id = $1 OR is_builtin = true) AND id = $2`

	var e Evaluator
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&e.ID, &e.OrgID, &e.Name, &e.Description,
		&e.Type, &e.Subtype, &e.Config, &e.IsBuiltin,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get evaluator: %w", err)
	}
	return &e, nil
}

// CreateEvaluator inserts a new evaluator.
func (s *PostgresStore) CreateEvaluator(ctx context.Context, e *Evaluator) error {
	query := `INSERT INTO evaluators (org_id, name, description, type, subtype, config, is_builtin)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)
	          RETURNING id, created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		e.OrgID, e.Name, e.Description, e.Type, e.Subtype, e.Config, e.IsBuiltin,
	).Scan(&e.ID, &e.CreatedAt, &e.UpdatedAt)
}

// UpdateEvaluator updates an existing evaluator.
func (s *PostgresStore) UpdateEvaluator(ctx context.Context, e *Evaluator) error {
	query := `UPDATE evaluators SET name = $1, description = $2, type = $3,
	          subtype = $4, config = $5, updated_at = NOW()
	          WHERE org_id = $6 AND id = $7
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		e.Name, e.Description, e.Type, e.Subtype, e.Config, e.OrgID, e.ID,
	).Scan(&e.UpdatedAt)
}

// DeleteEvaluator removes an evaluator.
func (s *PostgresStore) DeleteEvaluator(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM evaluators WHERE org_id = $1 AND id = $2 AND is_builtin = false`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete evaluator: %w", err)
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
// Test Runs
// ===========================

// ListTestRuns returns all test runs for an organization, optionally filtered by suite.
func (s *PostgresStore) ListTestRuns(ctx context.Context, orgID, suiteID string) ([]TestRun, error) {
	var query string
	var args []interface{}

	if suiteID != "" {
		query = `SELECT id, org_id, suite_id, status, total_cases, passed_cases,
		                failed_cases, error_cases, avg_score, duration_ms,
		                metadata, started_at, completed_at, created_at
		         FROM test_runs
		         WHERE org_id = $1 AND suite_id = $2
		         ORDER BY created_at DESC
		         LIMIT 50`
		args = []interface{}{orgID, suiteID}
	} else {
		query = `SELECT id, org_id, suite_id, status, total_cases, passed_cases,
		                failed_cases, error_cases, avg_score, duration_ms,
		                metadata, started_at, completed_at, created_at
		         FROM test_runs
		         WHERE org_id = $1
		         ORDER BY created_at DESC
		         LIMIT 50`
		args = []interface{}{orgID}
	}

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list test runs: %w", err)
	}
	defer rows.Close()

	var runs []TestRun
	for rows.Next() {
		var r TestRun
		if err := rows.Scan(&r.ID, &r.OrgID, &r.SuiteID, &r.Status,
			&r.TotalCases, &r.PassedCases, &r.FailedCases, &r.ErrorCases,
			&r.AvgScore, &r.DurationMs, &r.Metadata,
			&r.StartedAt, &r.CompletedAt, &r.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan test run: %w", err)
		}
		runs = append(runs, r)
	}
	if runs == nil {
		runs = []TestRun{}
	}
	return runs, rows.Err()
}

// GetTestRun returns a single test run with its results.
func (s *PostgresStore) GetTestRun(ctx context.Context, orgID, id string) (*TestRun, error) {
	query := `SELECT id, org_id, suite_id, status, total_cases, passed_cases,
	                 failed_cases, error_cases, avg_score, duration_ms,
	                 metadata, started_at, completed_at, created_at
	          FROM test_runs
	          WHERE org_id = $1 AND id = $2`

	var r TestRun
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&r.ID, &r.OrgID, &r.SuiteID, &r.Status,
		&r.TotalCases, &r.PassedCases, &r.FailedCases, &r.ErrorCases,
		&r.AvgScore, &r.DurationMs, &r.Metadata,
		&r.StartedAt, &r.CompletedAt, &r.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get test run: %w", err)
	}

	// Load results
	results, err := s.ListTestRunResults(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get test run results: %w", err)
	}
	r.Results = results

	return &r, nil
}

// CreateTestRun inserts a new test run.
func (s *PostgresStore) CreateTestRun(ctx context.Context, r *TestRun) error {
	query := `INSERT INTO test_runs (org_id, suite_id, status, total_cases, metadata)
	          VALUES ($1, $2, $3, $4, $5)
	          RETURNING id, created_at`

	return s.db.QueryRowContext(ctx, query,
		r.OrgID, r.SuiteID, r.Status, r.TotalCases, r.Metadata,
	).Scan(&r.ID, &r.CreatedAt)
}

// UpdateTestRun updates a test run's status and counters.
func (s *PostgresStore) UpdateTestRun(ctx context.Context, r *TestRun) error {
	query := `UPDATE test_runs SET status = $1, total_cases = $2, passed_cases = $3,
	          failed_cases = $4, error_cases = $5, avg_score = $6, duration_ms = $7,
	          started_at = $8, completed_at = $9
	          WHERE id = $10`

	_, err := s.db.ExecContext(ctx, query,
		r.Status, r.TotalCases, r.PassedCases, r.FailedCases,
		r.ErrorCases, r.AvgScore, r.DurationMs,
		r.StartedAt, r.CompletedAt, r.ID,
	)
	return err
}

// ===========================
// Test Run Results
// ===========================

// ListTestRunResults returns all results for a test run.
func (s *PostgresStore) ListTestRunResults(ctx context.Context, runID string) ([]TestRunResult, error) {
	query := `SELECT id, run_id, case_id, status, actual_output, scores,
	                 details, duration_ms, created_at
	          FROM test_run_results
	          WHERE run_id = $1
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, runID)
	if err != nil {
		return nil, fmt.Errorf("list test run results: %w", err)
	}
	defer rows.Close()

	var results []TestRunResult
	for rows.Next() {
		var res TestRunResult
		if err := rows.Scan(&res.ID, &res.RunID, &res.CaseID, &res.Status,
			&res.ActualOutput, &res.Scores, &res.Details,
			&res.DurationMs, &res.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan test run result: %w", err)
		}
		results = append(results, res)
	}
	if results == nil {
		results = []TestRunResult{}
	}
	return results, rows.Err()
}

// CreateTestRunResult inserts a new test run result.
func (s *PostgresStore) CreateTestRunResult(ctx context.Context, res *TestRunResult) error {
	query := `INSERT INTO test_run_results (run_id, case_id, status, actual_output,
	          scores, details, duration_ms)
	          VALUES ($1, $2, $3, $4, $5, $6, $7)
	          RETURNING id, created_at`

	return s.db.QueryRowContext(ctx, query,
		res.RunID, res.CaseID, res.Status, res.ActualOutput,
		res.Scores, res.Details, res.DurationMs,
	).Scan(&res.ID, &res.CreatedAt)
}

// UpdateTestRunResult updates a test run result.
func (s *PostgresStore) UpdateTestRunResult(ctx context.Context, res *TestRunResult) error {
	query := `UPDATE test_run_results SET status = $1, actual_output = $2,
	          scores = $3, details = $4, duration_ms = $5
	          WHERE id = $6`

	_, err := s.db.ExecContext(ctx, query,
		res.Status, res.ActualOutput, res.Scores,
		res.Details, res.DurationMs, res.ID,
	)
	return err
}

// CountTestCasesBySuite returns the number of test cases in a suite.
func (s *PostgresStore) CountTestCasesBySuite(ctx context.Context, suiteID string) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM test_cases WHERE suite_id = $1`, suiteID,
	).Scan(&count)
	return count, err
}

// GetTestCasesBySuite returns all test cases for a suite (for runner).
func (s *PostgresStore) GetTestCasesBySuite(ctx context.Context, suiteID string) ([]TestCase, error) {
	query := `SELECT id, suite_id, org_id, name, description, input, expected_output,
	                 context, evaluator_ids, tags, created_from_session,
	                 created_at, updated_at
	          FROM test_cases
	          WHERE suite_id = $1
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, suiteID)
	if err != nil {
		return nil, fmt.Errorf("get test cases by suite: %w", err)
	}
	defer rows.Close()

	var cases []TestCase
	for rows.Next() {
		var tc TestCase
		var tags, evalIDs string
		if err := rows.Scan(&tc.ID, &tc.SuiteID, &tc.OrgID, &tc.Name, &tc.Description,
			&tc.Input, &tc.ExpectedOutput, &tc.Context, &evalIDs, &tags,
			&tc.CreatedFromSession, &tc.CreatedAt, &tc.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan test case: %w", err)
		}
		tc.Tags = pgArrayToSlice(tags)
		tc.EvaluatorIDs = pgArrayToSlice(evalIDs)
		cases = append(cases, tc)
	}
	if cases == nil {
		cases = []TestCase{}
	}
	return cases, rows.Err()
}

// --- Helpers ---

// pgArrayToSlice converts a PostgreSQL text array literal to a Go string slice.
func pgArrayToSlice(s string) []string {
	if s == "" || s == "{}" {
		return []string{}
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return []string{}
	}
	return splitPGArray(s)
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
