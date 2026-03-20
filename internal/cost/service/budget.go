package service

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/cost/store"
)

// BudgetService handles budget enforcement and spend tracking.
type BudgetService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewBudgetService creates a new budget enforcement service.
func NewBudgetService(pg *store.PostgresStore, logger *slog.Logger) *BudgetService {
	return &BudgetService{pg: pg, logger: logger}
}

// BudgetCheckResult represents the result of a budget check.
type BudgetCheckResult struct {
	Allowed           bool   `json:"allowed"`
	BudgetID          string `json:"budget_id,omitempty"`
	BudgetName        string `json:"budget_name,omitempty"`
	Action            string `json:"action,omitempty"` // alert, throttle, block
	LimitCents        int    `json:"limit_cents,omitempty"`
	CurrentSpendCents int    `json:"current_spend_cents,omitempty"`
	UtilizationPct    int    `json:"utilization_pct,omitempty"`
	Message           string `json:"message,omitempty"`
}

// CheckBudget checks if spending is within budget for the given org/agent/model.
// Returns the most restrictive budget result.
func (s *BudgetService) CheckBudget(ctx context.Context, orgID, agentName, model string) (*BudgetCheckResult, error) {
	budgets, err := s.pg.ListBudgets(ctx, orgID)
	if err != nil {
		return nil, fmt.Errorf("list budgets: %w", err)
	}

	// Start with allowed result
	result := &BudgetCheckResult{Allowed: true}

	for _, b := range budgets {
		if !b.Enabled {
			continue
		}

		// Check if this budget applies to the given scope
		if !budgetApplies(b, agentName, model) {
			continue
		}

		utilizationPct := 0
		if b.LimitCents > 0 {
			utilizationPct = (b.CurrentSpendCents * 100) / b.LimitCents
		}

		// Check if budget is exceeded
		if b.CurrentSpendCents >= b.LimitCents {
			if b.Action == "block" {
				return &BudgetCheckResult{
					Allowed:           false,
					BudgetID:          b.ID,
					BudgetName:        b.Name,
					Action:            b.Action,
					LimitCents:        b.LimitCents,
					CurrentSpendCents: b.CurrentSpendCents,
					UtilizationPct:    utilizationPct,
					Message:           fmt.Sprintf("budget '%s' exceeded: %d/%d cents", b.Name, b.CurrentSpendCents, b.LimitCents),
				}, nil
			}

			// For alert and throttle, set the result but don't block
			result = &BudgetCheckResult{
				Allowed:           true,
				BudgetID:          b.ID,
				BudgetName:        b.Name,
				Action:            b.Action,
				LimitCents:        b.LimitCents,
				CurrentSpendCents: b.CurrentSpendCents,
				UtilizationPct:    utilizationPct,
				Message:           fmt.Sprintf("budget '%s' exceeded: %d/%d cents (action: %s)", b.Name, b.CurrentSpendCents, b.LimitCents, b.Action),
			}
		} else if utilizationPct >= b.AlertThresholdPct {
			// Approaching threshold
			if result.Allowed && result.BudgetID == "" {
				result = &BudgetCheckResult{
					Allowed:           true,
					BudgetID:          b.ID,
					BudgetName:        b.Name,
					Action:            "alert",
					LimitCents:        b.LimitCents,
					CurrentSpendCents: b.CurrentSpendCents,
					UtilizationPct:    utilizationPct,
					Message:           fmt.Sprintf("budget '%s' at %d%% utilization", b.Name, utilizationPct),
				}
			}
		}
	}

	return result, nil
}

// UpdateSpend increments the current spend for a budget.
func (s *BudgetService) UpdateSpend(ctx context.Context, budgetID string, amountCents int) error {
	// We recalculate from events rather than incrementing to stay accurate
	budget, err := s.pg.GetBudget(ctx, "", budgetID)
	if err != nil {
		return fmt.Errorf("get budget: %w", err)
	}
	if budget == nil {
		return fmt.Errorf("budget not found: %s", budgetID)
	}

	newSpend := budget.CurrentSpendCents + amountCents
	return s.pg.UpdateBudgetSpend(ctx, budgetID, newSpend)
}

// ResetExpiredPeriods checks all enabled budgets and resets spend for those
// whose period has expired.
func (s *BudgetService) ResetExpiredPeriods(ctx context.Context) (int, error) {
	budgets, err := s.pg.ListEnabledBudgets(ctx)
	if err != nil {
		return 0, fmt.Errorf("list enabled budgets: %w", err)
	}

	now := time.Now().UTC()
	resetCount := 0

	for _, b := range budgets {
		periodEnd := calculatePeriodEnd(b.PeriodStart, b.Period)
		if now.After(periodEnd) {
			newStart := calculateNextPeriodStart(b.PeriodStart, b.Period, now)
			if err := s.pg.ResetBudgetPeriod(ctx, b.ID, newStart); err != nil {
				s.logger.Error("failed to reset budget period",
					"budget_id", b.ID,
					"budget_name", b.Name,
					"error", err,
				)
				continue
			}
			s.logger.Info("reset budget period",
				"budget_id", b.ID,
				"budget_name", b.Name,
				"old_period_start", b.PeriodStart,
				"new_period_start", newStart,
			)
			resetCount++
		}
	}

	return resetCount, nil
}

// RecalculateBudgetSpends recalculates current_spend_cents from cost_events for all
// enabled budgets. Called by the budget checker worker.
func (s *BudgetService) RecalculateBudgetSpends(ctx context.Context) (int, error) {
	budgets, err := s.pg.ListEnabledBudgets(ctx)
	if err != nil {
		return 0, fmt.Errorf("list enabled budgets: %w", err)
	}

	updated := 0
	for _, b := range budgets {
		spend, err := s.pg.GetBudgetSpendFromEvents(ctx, &b)
		if err != nil {
			s.logger.Error("failed to calculate budget spend",
				"budget_id", b.ID,
				"error", err,
			)
			continue
		}

		if spend != b.CurrentSpendCents {
			if err := s.pg.UpdateBudgetSpend(ctx, b.ID, spend); err != nil {
				s.logger.Error("failed to update budget spend",
					"budget_id", b.ID,
					"error", err,
				)
				continue
			}
			updated++
		}
	}

	return updated, nil
}

// CheckAlertThresholds returns budgets that have crossed their alert threshold.
func (s *BudgetService) CheckAlertThresholds(ctx context.Context) ([]store.Budget, error) {
	budgets, err := s.pg.ListEnabledBudgets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list enabled budgets: %w", err)
	}

	var exceeded []store.Budget
	for _, b := range budgets {
		if b.LimitCents <= 0 {
			continue
		}
		utilizationPct := (b.CurrentSpendCents * 100) / b.LimitCents
		if utilizationPct >= b.AlertThresholdPct {
			exceeded = append(exceeded, b)
		}
	}

	return exceeded, nil
}

// budgetApplies returns true if a budget policy applies to the given agent/model.
func budgetApplies(b store.Budget, agentName, model string) bool {
	switch b.Scope {
	case "org":
		return true
	case "agent":
		return b.ScopeValue == "" || b.ScopeValue == agentName
	case "model":
		return b.ScopeValue == "" || b.ScopeValue == model
	default:
		return false
	}
}

// calculatePeriodEnd returns the end of the budget period.
func calculatePeriodEnd(start time.Time, period string) time.Time {
	switch period {
	case "daily":
		return start.AddDate(0, 0, 1)
	case "weekly":
		return start.AddDate(0, 0, 7)
	case "monthly":
		return start.AddDate(0, 1, 0)
	default:
		return start.AddDate(0, 1, 0)
	}
}

// calculateNextPeriodStart finds the correct new period start so the budget period
// is always aligned forward from the original start.
func calculateNextPeriodStart(originalStart time.Time, period string, now time.Time) time.Time {
	start := originalStart
	for {
		end := calculatePeriodEnd(start, period)
		if end.After(now) {
			return start
		}
		start = end
	}
}
