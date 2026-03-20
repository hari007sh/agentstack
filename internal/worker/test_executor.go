package worker

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/agentstack/agentstack/internal/test/service"
	"github.com/agentstack/agentstack/internal/test/store"
	"github.com/nats-io/nats.go"
)

// SubjectTestRunExecute is the NATS subject for test run execution requests.
const SubjectTestRunExecute = "test.run.execute"

// testRunRequest is the NATS message payload for triggering a test run.
type testRunRequest struct {
	RunID string `json:"run_id"`
}

// TestExecutor subscribes to NATS for async test run execution.
// When a test run is created, the handler publishes to SubjectTestRunExecute,
// and this worker picks it up, executes all test cases, and updates results.
type TestExecutor struct {
	nc     *nats.Conn
	runner *service.RunnerService
	logger *slog.Logger
	done   chan struct{}
	sub    *nats.Subscription
}

// NewTestExecutor creates a new test executor worker.
func NewTestExecutor(nc *nats.Conn, pg *store.PostgresStore, logger *slog.Logger) *TestExecutor {
	evalSvc := service.NewEvaluatorService(logger)
	runnerSvc := service.NewRunnerService(pg, evalSvc, logger)

	return &TestExecutor{
		nc:     nc,
		runner: runnerSvc,
		logger: logger,
		done:   make(chan struct{}),
	}
}

// Start subscribes to the test run execution NATS subject.
func (te *TestExecutor) Start() error {
	sub, err := te.nc.Subscribe(SubjectTestRunExecute, te.handleTestRun)
	if err != nil {
		return err
	}
	te.sub = sub
	te.logger.Info("test executor started", "subject", SubjectTestRunExecute)
	return nil
}

// Stop gracefully shuts down the test executor.
func (te *TestExecutor) Stop() {
	close(te.done)
	if te.sub != nil {
		if err := te.sub.Unsubscribe(); err != nil {
			te.logger.Warn("failed to unsubscribe test executor", "error", err)
		}
	}
	te.logger.Info("test executor stopped")
}

func (te *TestExecutor) handleTestRun(msg *nats.Msg) {
	var req testRunRequest
	if err := json.Unmarshal(msg.Data, &req); err != nil {
		te.logger.Error("failed to unmarshal test run request", "error", err)
		return
	}

	if req.RunID == "" {
		te.logger.Error("test run request missing run_id")
		return
	}

	te.logger.Info("executing test run", "run_id", req.RunID)

	ctx := context.Background()
	if err := te.runner.ExecuteRun(ctx, req.RunID); err != nil {
		te.logger.Error("test run execution failed", "run_id", req.RunID, "error", err)
		return
	}

	te.logger.Info("test run completed", "run_id", req.RunID)
}
