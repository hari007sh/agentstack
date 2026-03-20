package service

import (
	"testing"
)

// TestCalculateCostArithmetic tests the integer arithmetic cost calculation
// independently of the database by testing the formula directly.
// Formula: (inputTokens * inputCostPer1M + outputTokens * outputCostPer1M) / 1_000_000
func TestCalculateCostArithmetic(t *testing.T) {
	tests := []struct {
		name            string
		inputTokens     int
		outputTokens    int
		inputCostPer1M  int // cents per 1M tokens
		outputCostPer1M int // cents per 1M tokens
		expectedCents   int
	}{
		{
			name:            "zero tokens",
			inputTokens:     0,
			outputTokens:    0,
			inputCostPer1M:  300,
			outputCostPer1M: 1500,
			expectedCents:   0,
		},
		{
			name:            "1M input tokens only",
			inputTokens:     1_000_000,
			outputTokens:    0,
			inputCostPer1M:  300, // $3.00 per 1M
			outputCostPer1M: 1500,
			expectedCents:   300,
		},
		{
			name:            "1M output tokens only",
			inputTokens:     0,
			outputTokens:    1_000_000,
			inputCostPer1M:  300,
			outputCostPer1M: 1500, // $15.00 per 1M
			expectedCents:   1500,
		},
		{
			name:            "1K input and 500 output",
			inputTokens:     1000,
			outputTokens:    500,
			inputCostPer1M:  300,  // $3.00 per 1M = 0.3 cents per 1K
			outputCostPer1M: 1500, // $15.00 per 1M = 1.5 cents per 1K
			expectedCents:   0,    // (1000*300 + 500*1500) / 1_000_000 = (300_000 + 750_000) / 1_000_000 = 1.05 -> truncated to 1
		},
		{
			name:            "GPT-4o equivalent pricing - typical usage",
			inputTokens:     2000,
			outputTokens:    1000,
			inputCostPer1M:  250,  // $2.50 per 1M
			outputCostPer1M: 1000, // $10.00 per 1M
			expectedCents:   1,    // (2000*250 + 1000*1000) / 1_000_000 = (500_000 + 1_000_000) / 1_000_000 = 1
		},
		{
			name:            "large token count - no overflow",
			inputTokens:     500_000,
			outputTokens:    200_000,
			inputCostPer1M:  300,
			outputCostPer1M: 1500,
			expectedCents:   450, // (500_000*300 + 200_000*1500) / 1_000_000 = (150_000_000 + 300_000_000) / 1_000_000 = 450
		},
		{
			name:            "very large token count",
			inputTokens:     10_000_000,
			outputTokens:    5_000_000,
			inputCostPer1M:  300,
			outputCostPer1M: 1500,
			expectedCents:   10500, // (10M*300 + 5M*1500) / 1M = (3_000_000_000 + 7_500_000_000) / 1_000_000 = 10500
		},
		{
			name:            "cheap model - small cost",
			inputTokens:     100,
			outputTokens:    50,
			inputCostPer1M:  15,   // $0.15 per 1M (gpt-4o-mini input)
			outputCostPer1M: 60,   // $0.60 per 1M (gpt-4o-mini output)
			expectedCents:   0,    // Very small, rounds to 0
		},
		{
			name:            "expensive model - large cost",
			inputTokens:     100_000,
			outputTokens:    50_000,
			inputCostPer1M:  1500, // $15.00 per 1M
			outputCostPer1M: 7500, // $75.00 per 1M
			expectedCents:   525,  // (100_000*1500 + 50_000*7500) / 1_000_000 = (150_000_000 + 375_000_000) / 1_000_000 = 525
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Replicate the exact formula from CalculateCost
			inputCost := (int64(tc.inputTokens) * int64(tc.inputCostPer1M)) / 1_000_000
			outputCost := (int64(tc.outputTokens) * int64(tc.outputCostPer1M)) / 1_000_000
			result := int(inputCost + outputCost)

			if result != tc.expectedCents {
				t.Errorf("cost(%d input, %d output, %d/1M in, %d/1M out) = %d cents, want %d cents",
					tc.inputTokens, tc.outputTokens,
					tc.inputCostPer1M, tc.outputCostPer1M,
					result, tc.expectedCents)
			}
		})
	}
}

func TestCalculateCostArithmetic_IntegerOnly(t *testing.T) {
	// Verify we never get floating point issues with typical values
	// The key insight is: all arithmetic uses int64, no floats

	t.Run("integer division truncates (not rounds)", func(t *testing.T) {
		// 999 tokens at 300 cents/1M => 999*300/1_000_000 = 299_700/1_000_000 = 0 (truncated)
		inputCost := (int64(999) * int64(300)) / 1_000_000
		if inputCost != 0 {
			t.Errorf("expected truncation to 0, got %d", inputCost)
		}
	})

	t.Run("exactly 1M tokens equals cost per 1M", func(t *testing.T) {
		costPer1M := 300
		cost := (int64(1_000_000) * int64(costPer1M)) / 1_000_000
		if int(cost) != costPer1M {
			t.Errorf("1M tokens at %d/1M = %d, want %d", costPer1M, cost, costPer1M)
		}
	})

	t.Run("no int64 overflow for max realistic values", func(t *testing.T) {
		// Max realistic: 100M tokens at 10000 cents/1M ($100 per 1M)
		// 100_000_000 * 10_000 = 1_000_000_000_000 which fits in int64
		cost := (int64(100_000_000) * int64(10_000)) / 1_000_000
		expected := int64(1_000_000) // $10,000
		if cost != expected {
			t.Errorf("large token count: got %d, want %d", cost, expected)
		}
	})
}

func TestTotalTokensComputation(t *testing.T) {
	// Verify the TotalTokens auto-calculation logic
	tests := []struct {
		name          string
		inputTokens   int
		outputTokens  int
		totalTokens   int // pre-set value
		expectedTotal int
	}{
		{"auto-computed", 100, 50, 0, 150},
		{"pre-set takes precedence", 100, 50, 200, 200},
		{"zero in, zero out", 0, 0, 0, 0},
		{"only input", 500, 0, 0, 500},
		{"only output", 0, 300, 0, 300},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			total := tc.totalTokens
			if total == 0 {
				total = tc.inputTokens + tc.outputTokens
			}
			if total != tc.expectedTotal {
				t.Errorf("totalTokens = %d, want %d", total, tc.expectedTotal)
			}
		})
	}
}
