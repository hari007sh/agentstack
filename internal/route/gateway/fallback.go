package gateway

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/agentstack/agentstack/internal/route/provider"
	"github.com/agentstack/agentstack/internal/route/store"
)

// FallbackExecutor tries each provider in a fallback chain until one succeeds.
type FallbackExecutor struct {
	router *Router
	logger *slog.Logger
}

// NewFallbackExecutor creates a new FallbackExecutor.
func NewFallbackExecutor(router *Router, logger *slog.Logger) *FallbackExecutor {
	return &FallbackExecutor{router: router, logger: logger}
}

// FallbackResult contains the outcome of a fallback chain execution.
type FallbackResult struct {
	Response     *provider.ChatResponse
	ProviderName string
	ModelUsed    string
	Attempts     int
	Errors       []FallbackError
}

// FallbackError records an error from one step of the fallback chain.
type FallbackError struct {
	ProviderID string `json:"provider_id"`
	Model      string `json:"model"`
	Error      string `json:"error"`
	StatusCode int    `json:"status_code"`
}

// ExecuteChain tries each provider in the chain in order.
// Returns on the first success or after all providers have been tried.
func (f *FallbackExecutor) ExecuteChain(ctx context.Context, chain *store.FallbackChain, req *provider.ChatRequest) (*FallbackResult, error) {
	result := &FallbackResult{}

	for _, entry := range chain.Chain {
		result.Attempts++

		adapter, ok := f.router.GetAdapter(entry.ProviderID)
		if !ok {
			result.Errors = append(result.Errors, FallbackError{
				ProviderID: entry.ProviderID,
				Model:      entry.Model,
				Error:      "provider adapter not found",
			})
			continue
		}

		// Create a copy of the request with the fallback model
		fallbackReq := *req
		fallbackReq.Model = entry.Model

		// Apply timeout for this attempt
		timeoutMs := entry.TimeoutMs
		if timeoutMs <= 0 {
			timeoutMs = 30000
		}
		attemptCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)

		resp, err := adapter.ChatCompletion(attemptCtx, &fallbackReq)
		cancel()

		if err == nil {
			result.Response = resp
			result.ProviderName = adapter.Name()
			result.ModelUsed = entry.Model
			return result, nil
		}

		fe := FallbackError{
			ProviderID: entry.ProviderID,
			Model:      entry.Model,
			Error:      err.Error(),
		}

		// Check if the error is retryable
		if provErr, ok := err.(*provider.ProviderError); ok {
			fe.StatusCode = provErr.StatusCode
			if !provErr.IsRetryable() {
				result.Errors = append(result.Errors, fe)
				return nil, fmt.Errorf("non-retryable error from %s: %w", adapter.Name(), err)
			}
		}

		result.Errors = append(result.Errors, fe)
		f.logger.Warn("fallback attempt failed",
			"provider", adapter.Name(),
			"model", entry.Model,
			"attempt", result.Attempts,
			"error", err,
		)
	}

	return nil, fmt.Errorf("all %d fallback providers failed", result.Attempts)
}
