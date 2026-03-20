package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/agentstack/agentstack/internal/test/store"
)

// RunnerService orchestrates test run creation and execution.
type RunnerService struct {
	pg        *store.PostgresStore
	evaluator *EvaluatorService
	logger    *slog.Logger
}

// NewRunnerService creates a new runner service.
func NewRunnerService(pg *store.PostgresStore, evaluator *EvaluatorService, logger *slog.Logger) *RunnerService {
	return &RunnerService{
		pg:        pg,
		evaluator: evaluator,
		logger:    logger,
	}
}

// CreateRun creates a new test run record in pending status.
func (s *RunnerService) CreateRun(ctx context.Context, orgID, suiteID string, metadata json.RawMessage) (*store.TestRun, error) {
	// Verify the suite exists
	suite, err := s.pg.GetTestSuite(ctx, orgID, suiteID)
	if err != nil {
		return nil, fmt.Errorf("get test suite: %w", err)
	}
	if suite == nil {
		return nil, fmt.Errorf("test suite not found")
	}

	// Count test cases
	caseCount, err := s.pg.CountTestCasesBySuite(ctx, suiteID)
	if err != nil {
		return nil, fmt.Errorf("count test cases: %w", err)
	}
	if caseCount == 0 {
		return nil, fmt.Errorf("test suite has no test cases")
	}

	if metadata == nil {
		metadata = json.RawMessage("{}")
	}

	run := &store.TestRun{
		OrgID:      orgID,
		SuiteID:    suiteID,
		Status:     "pending",
		TotalCases: caseCount,
		Metadata:   metadata,
	}

	if err := s.pg.CreateTestRun(ctx, run); err != nil {
		return nil, fmt.Errorf("create test run: %w", err)
	}

	s.logger.Info("created test run", "run_id", run.ID, "suite_id", suiteID, "total_cases", caseCount)
	return run, nil
}

// ExecuteRun executes all test cases in a run. This is called by the background worker.
// For now, this is a stub that evaluates cases with programmatic evaluators
// and marks others as passed/failed with simulated scores.
func (s *RunnerService) ExecuteRun(ctx context.Context, runID string) error {
	// Get the run
	// We need to find the run without org_id restriction since the worker doesn't have it
	runs, err := s.pg.ListTestRunResults(ctx, runID)
	if err != nil {
		s.logger.Error("failed to list existing results for run", "run_id", runID, "error", err)
	}
	_ = runs

	// For the worker path, we look up the run by scanning all orgs.
	// In a real implementation, the run ID is sufficient since it's globally unique.
	// We'll query directly to get the run.
	run, err := s.getRunByID(ctx, runID)
	if err != nil {
		return fmt.Errorf("get run: %w", err)
	}
	if run == nil {
		return fmt.Errorf("run not found: %s", runID)
	}

	// Mark run as running
	now := time.Now().UTC()
	run.Status = "running"
	run.StartedAt = &now
	if err := s.pg.UpdateTestRun(ctx, run); err != nil {
		return fmt.Errorf("update run status to running: %w", err)
	}

	// Get test cases for the suite
	cases, err := s.pg.GetTestCasesBySuite(ctx, run.SuiteID)
	if err != nil {
		run.Status = "failed"
		s.pg.UpdateTestRun(ctx, run)
		return fmt.Errorf("get test cases: %w", err)
	}

	startTime := time.Now()
	var totalScore float64
	scoredCount := 0

	for _, tc := range cases {
		result := s.executeTestCase(ctx, run.ID, tc)
		if err := s.pg.CreateTestRunResult(ctx, &result); err != nil {
			s.logger.Error("failed to save test result", "run_id", runID, "case_id", tc.ID, "error", err)
			run.ErrorCases++
			continue
		}

		switch result.Status {
		case "passed":
			run.PassedCases++
		case "failed":
			run.FailedCases++
		case "error":
			run.ErrorCases++
		}

		// Parse score from result
		var scores map[string]float64
		if err := json.Unmarshal(result.Scores, &scores); err == nil {
			for _, sc := range scores {
				totalScore += sc
				scoredCount++
			}
		}
	}

	// Finalize
	completedAt := time.Now().UTC()
	run.Status = "completed"
	run.CompletedAt = &completedAt
	run.DurationMs = time.Since(startTime).Milliseconds()
	if scoredCount > 0 {
		run.AvgScore = totalScore / float64(scoredCount)
	}

	if err := s.pg.UpdateTestRun(ctx, run); err != nil {
		return fmt.Errorf("update run final status: %w", err)
	}

	s.logger.Info("completed test run",
		"run_id", runID,
		"passed", run.PassedCases,
		"failed", run.FailedCases,
		"errors", run.ErrorCases,
		"avg_score", run.AvgScore,
		"duration_ms", run.DurationMs,
	)

	return nil
}

// executeTestCase runs evaluators for a single test case and returns a result.
func (s *RunnerService) executeTestCase(ctx context.Context, runID string, tc store.TestCase) store.TestRunResult {
	startTime := time.Now()

	// Simulate agent output (stub — in production, this would call the actual agent)
	simulatedOutput := fmt.Sprintf("Simulated output for test case: %s", tc.Name)

	evalInput := EvalInput{
		Input:          tc.Input,
		Output:         simulatedOutput,
		ExpectedOutput: tc.ExpectedOutput,
		Context:        tc.Context,
		DurationMs:     int64(rand.Intn(5000) + 100),
		TokensUsed:     rand.Intn(500) + 50,
	}

	scores := make(map[string]float64)
	details := make(map[string]interface{})

	// Run evaluators for this test case
	if len(tc.EvaluatorIDs) > 0 {
		for _, evalID := range tc.EvaluatorIDs {
			eval, err := s.pg.GetEvaluator(ctx, tc.OrgID, evalID)
			if err != nil || eval == nil {
				s.logger.Warn("evaluator not found", "evaluator_id", evalID)
				continue
			}

			result := s.evaluator.Evaluate(ctx, eval.Type, eval.Subtype, eval.Config, evalInput)
			scores[eval.Name] = result.Score
			details[eval.Name] = map[string]interface{}{
				"score":     result.Score,
				"passed":    result.Passed,
				"reasoning": result.Reasoning,
			}
		}
	} else {
		// Default: run a simple check (length check)
		result := s.evaluator.Evaluate(ctx, "programmatic", "length_check", nil, evalInput)
		scores["length_check"] = result.Score
		details["length_check"] = map[string]interface{}{
			"score":     result.Score,
			"passed":    result.Passed,
			"reasoning": result.Reasoning,
		}
	}

	// Determine overall pass/fail
	status := "passed"
	for _, score := range scores {
		if score < 0.7 {
			status = "failed"
			break
		}
	}

	scoresJSON, _ := json.Marshal(scores)
	detailsJSON, _ := json.Marshal(details)
	outputJSON, _ := json.Marshal(simulatedOutput)
	durationMs := time.Since(startTime).Milliseconds()

	return store.TestRunResult{
		RunID:        runID,
		CaseID:       tc.ID,
		Status:       status,
		ActualOutput: outputJSON,
		Scores:       scoresJSON,
		Details:      detailsJSON,
		DurationMs:   durationMs,
	}
}

// getRunByID retrieves a test run by its ID without requiring org_id.
// Used internally by the worker which doesn't have org context.
func (s *RunnerService) getRunByID(ctx context.Context, runID string) (*store.TestRun, error) {
	// The worker needs to look up runs without org_id context.
	// We query directly by the run's primary key.
	query := `SELECT id, org_id, suite_id, status, total_cases, passed_cases,
	                 failed_cases, error_cases, avg_score, duration_ms,
	                 metadata, started_at, completed_at, created_at
	          FROM test_runs WHERE id = $1`

	var r store.TestRun
	err := s.pg.DB().QueryRowContext(ctx, query, runID).Scan(
		&r.ID, &r.OrgID, &r.SuiteID, &r.Status,
		&r.TotalCases, &r.PassedCases, &r.FailedCases, &r.ErrorCases,
		&r.AvgScore, &r.DurationMs, &r.Metadata,
		&r.StartedAt, &r.CompletedAt, &r.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("get run by id: %w", err)
	}
	return &r, nil
}
