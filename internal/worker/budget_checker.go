package worker

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/cost/service"
	"github.com/agentstack/agentstack/internal/cost/store"
)

const budgetCheckInterval = 60 * time.Second

// BudgetChecker periodically enforces budget policies by recalculating spend
// from cost_events, resetting expired periods, and creating alerts when
// thresholds are crossed.
type BudgetChecker struct {
	budgetSvc *service.BudgetService
	logger    *slog.Logger
	done      chan struct{}
}

// NewBudgetChecker creates a new budget checker worker.
func NewBudgetChecker(pgDB *sql.DB, logger *slog.Logger) *BudgetChecker {
	pg := store.NewPostgresStore(pgDB)
	budgetSvc := service.NewBudgetService(pg, logger)
	return &BudgetChecker{
		budgetSvc: budgetSvc,
		logger:    logger,
		done:      make(chan struct{}),
	}
}

// Start begins the periodic budget checking loop.
func (bc *BudgetChecker) Start() {
	bc.logger.Info("budget checker started", "interval", budgetCheckInterval)
	go bc.loop()
}

// Stop terminates the budget checking loop.
func (bc *BudgetChecker) Stop() {
	close(bc.done)
	bc.logger.Info("budget checker stopped")
}

func (bc *BudgetChecker) loop() {
	ticker := time.NewTicker(budgetCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			bc.run()
		case <-bc.done:
			return
		}
	}
}

func (bc *BudgetChecker) run() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Step 1: Reset spend for expired periods
	resetCount, err := bc.budgetSvc.ResetExpiredPeriods(ctx)
	if err != nil {
		bc.logger.Error("failed to reset expired periods", "error", err)
	} else if resetCount > 0 {
		bc.logger.Info("reset expired budget periods", "count", resetCount)
	}

	// Step 2: Recalculate current_spend_cents from cost_events
	updatedCount, err := bc.budgetSvc.RecalculateBudgetSpends(ctx)
	if err != nil {
		bc.logger.Error("failed to recalculate budget spends", "error", err)
	} else if updatedCount > 0 {
		bc.logger.Info("updated budget spends from events", "count", updatedCount)
	}

	// Step 3: Check alert thresholds
	exceeded, err := bc.budgetSvc.CheckAlertThresholds(ctx)
	if err != nil {
		bc.logger.Error("failed to check alert thresholds", "error", err)
		return
	}

	for _, b := range exceeded {
		utilizationPct := 0
		if b.LimitCents > 0 {
			utilizationPct = (b.CurrentSpendCents * 100) / b.LimitCents
		}
		bc.logger.Warn("budget threshold exceeded",
			"budget_id", b.ID,
			"budget_name", b.Name,
			"org_id", b.OrgID,
			"scope", b.Scope,
			"scope_value", b.ScopeValue,
			"action", b.Action,
			"current_spend_cents", b.CurrentSpendCents,
			"limit_cents", b.LimitCents,
			"utilization_pct", utilizationPct,
			"alert_threshold_pct", b.AlertThresholdPct,
		)
	}
}
