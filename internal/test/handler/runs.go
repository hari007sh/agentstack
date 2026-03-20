package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/test/service"
	"github.com/agentstack/agentstack/internal/test/store"
	"github.com/agentstack/agentstack/internal/worker"
	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go"
)

// RunHandler handles test run endpoints.
type RunHandler struct {
	pg     *store.PostgresStore
	runner *service.RunnerService
	nc     *nats.Conn
	logger *slog.Logger
}

// NewRunHandler creates a new run handler.
func NewRunHandler(pg *store.PostgresStore, runner *service.RunnerService, nc *nats.Conn, logger *slog.Logger) *RunHandler {
	return &RunHandler{pg: pg, runner: runner, nc: nc, logger: logger}
}

// startRunRequest is the request body for starting a test run.
type startRunRequest struct {
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// ciRunRequest is the request body for the CI/CD endpoint.
type ciRunRequest struct {
	SuiteID     string          `json:"suite_id"`
	CommitSHA   string          `json:"commit_sha,omitempty"`
	Branch      string          `json:"branch,omitempty"`
	Repo        string          `json:"repo,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
}

// StartRun handles POST /v1/test/suites/{suiteId}/run.
// Creates a test run and starts execution asynchronously. Returns 202 Accepted.
func (h *RunHandler) StartRun(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	suiteID := chi.URLParam(r, "suiteId")
	if suiteID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite ID is required")
		return
	}

	var req startRunRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := httputil.ReadJSON(r, &req); err != nil {
			httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
			return
		}
	}

	run, err := h.runner.CreateRun(r.Context(), orgID, suiteID, req.Metadata)
	if err != nil {
		h.logger.Error("failed to create test run", "suite_id", suiteID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", err.Error())
		return
	}

	// Publish to NATS for async execution by the test executor worker.
	// Falls back to goroutine if NATS is unavailable.
	if h.nc != nil && h.nc.IsConnected() {
		msg, _ := json.Marshal(map[string]string{"run_id": run.ID})
		if pubErr := h.nc.Publish(worker.SubjectTestRunExecute, msg); pubErr != nil {
			h.logger.Warn("failed to publish test run to NATS, falling back to goroutine", "error", pubErr)
			go func() {
				if execErr := h.runner.ExecuteRun(r.Context(), run.ID); execErr != nil {
					h.logger.Error("test run execution failed", "run_id", run.ID, "error", execErr)
				}
			}()
		}
	} else {
		go func() {
			if execErr := h.runner.ExecuteRun(r.Context(), run.ID); execErr != nil {
				h.logger.Error("test run execution failed", "run_id", run.ID, "error", execErr)
			}
		}()
	}

	h.logger.Info("started test run", "run_id", run.ID, "suite_id", suiteID, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusAccepted, map[string]interface{}{
		"run":     run,
		"message": "test run started",
	})
}

// List handles GET /v1/test/runs.
func (h *RunHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	suiteID := r.URL.Query().Get("suite_id")

	runs, err := h.pg.ListTestRuns(r.Context(), orgID, suiteID)
	if err != nil {
		h.logger.Error("failed to list test runs", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list test runs")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"runs": runs,
	})
}

// Get handles GET /v1/test/runs/{id}.
func (h *RunHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "run ID is required")
		return
	}

	run, err := h.pg.GetTestRun(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get test run", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get test run")
		return
	}
	if run == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "test run not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, run)
}

// CIRun handles POST /v1/test/ci/run.
// Starts a test run synchronously and returns the results when complete.
// This is designed for CI/CD pipelines that need to gate deploys on test results.
func (h *RunHandler) CIRun(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req ciRunRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.SuiteID == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "suite_id is required")
		return
	}

	// Build metadata with CI info
	meta := map[string]interface{}{}
	if req.CommitSHA != "" {
		meta["ci_commit_sha"] = req.CommitSHA
	}
	if req.Branch != "" {
		meta["ci_branch"] = req.Branch
	}
	if req.Repo != "" {
		meta["ci_repo"] = req.Repo
	}
	meta["triggered_by"] = "ci_cd"
	metaJSON, _ := json.Marshal(meta)

	run, err := h.runner.CreateRun(r.Context(), orgID, req.SuiteID, metaJSON)
	if err != nil {
		h.logger.Error("failed to create CI test run", "suite_id", req.SuiteID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", err.Error())
		return
	}

	// Execute synchronously for CI/CD
	if err := h.runner.ExecuteRun(r.Context(), run.ID); err != nil {
		h.logger.Error("CI test run execution failed", "run_id", run.ID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "EXECUTION_ERROR", "test run execution failed")
		return
	}

	// Reload the run with results
	completedRun, err := h.pg.GetTestRun(r.Context(), orgID, run.ID)
	if err != nil {
		h.logger.Error("failed to get completed CI run", "run_id", run.ID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get completed run")
		return
	}

	// Determine overall pass/fail for CI gate
	passed := completedRun.Status == "completed" && completedRun.FailedCases == 0 && completedRun.ErrorCases == 0

	h.logger.Info("CI test run completed",
		"run_id", run.ID,
		"suite_id", req.SuiteID,
		"passed", passed,
		"avg_score", completedRun.AvgScore,
	)

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"run":    completedRun,
		"passed": passed,
	})
}
