package service

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/agentstack/agentstack/internal/route/provider"
	routeservice "github.com/agentstack/agentstack/internal/route/service"
	routestore "github.com/agentstack/agentstack/internal/route/store"
)

// ExecuteConfig holds model parameter overrides.
type ExecuteConfig struct {
	Temperature *float64 `json:"temperature,omitempty"`
	MaxTokens   *int     `json:"max_tokens,omitempty"`
	TopP        *float64 `json:"top_p,omitempty"`
}

// ExecuteRequest is the input for a playground execution.
type ExecuteRequest struct {
	PromptID     string                 `json:"prompt_id"`
	Body         string                 `json:"body"`
	SystemPrompt string                 `json:"system_prompt"`
	Variables    map[string]interface{} `json:"variables"`
	Model        string                 `json:"model"`
	Provider     string                 `json:"provider"`
	Config       ExecuteConfig          `json:"config"`
	Stream       bool                   `json:"stream"`
}

// ExecuteResult is the output of a non-streaming execution.
type ExecuteResult struct {
	Output       string `json:"output"`
	Model        string `json:"model"`
	Provider     string `json:"provider"`
	TokensIn     int    `json:"tokens_in"`
	TokensOut    int    `json:"tokens_out"`
	CostCents    int64  `json:"cost_cents"`
	LatencyMs    int    `json:"latency_ms"`
	FinishReason string `json:"finish_reason"`
}

// CompareModelConfig identifies a model+provider pair.
type CompareModelConfig struct {
	Model    string `json:"model"`
	Provider string `json:"provider"`
}

// CompareRequest is the input for comparing multiple models.
type CompareRequest struct {
	Body         string                 `json:"body"`
	SystemPrompt string                 `json:"system_prompt"`
	Variables    map[string]interface{} `json:"variables"`
	Models       []CompareModelConfig   `json:"models"`
	Config       ExecuteConfig          `json:"config"`
}

// CompareResult is the output of a comparison run.
type CompareResult struct {
	Results []ExecuteResult `json:"results"`
}

// Executor sends prompts to LLM providers via the Route module's provider adapters.
type Executor struct {
	routeStore *routestore.Store
	encSvc     *routeservice.Encryption
	renderer   *Renderer
	logger     *slog.Logger
}

// NewExecutor creates a new Executor.
func NewExecutor(routeStore *routestore.Store, encSvc *routeservice.Encryption, logger *slog.Logger) *Executor {
	return &Executor{
		routeStore: routeStore,
		encSvc:     encSvc,
		renderer:   NewRenderer(),
		logger:     logger,
	}
}

// Execute runs a prompt against a single model and returns the result.
func (e *Executor) Execute(ctx context.Context, orgID string, req ExecuteRequest) (*ExecuteResult, error) {
	// Render variables into the body
	renderedBody := e.renderer.RenderSimple(req.Body, req.Variables)

	// Build the chat request
	chatReq := e.buildChatRequest(renderedBody, req.SystemPrompt, req.Model, req.Config)

	// Get provider adapter
	adapter, err := e.getAdapter(ctx, orgID, req.Provider)
	if err != nil {
		return nil, fmt.Errorf("get provider adapter: %w", err)
	}

	// Execute
	start := time.Now()
	resp, err := adapter.ChatCompletion(ctx, chatReq)
	if err != nil {
		return nil, fmt.Errorf("chat completion: %w", err)
	}
	latencyMs := int(time.Since(start).Milliseconds())

	// Build result
	result := &ExecuteResult{
		Model:     req.Model,
		Provider:  req.Provider,
		LatencyMs: latencyMs,
	}

	if len(resp.Choices) > 0 {
		if content, ok := resp.Choices[0].Message.Content.(string); ok {
			result.Output = content
		}
		result.FinishReason = resp.Choices[0].FinishReason
	}

	if resp.Usage != nil {
		result.TokensIn = resp.Usage.PromptTokens
		result.TokensOut = resp.Usage.CompletionTokens
	}

	return result, nil
}

// ExecuteStream runs a prompt and streams the response via SSE.
func (e *Executor) ExecuteStream(ctx context.Context, orgID string, req ExecuteRequest, w http.ResponseWriter) error {
	// Render variables into the body
	renderedBody := e.renderer.RenderSimple(req.Body, req.Variables)

	// Build the chat request
	chatReq := e.buildChatRequest(renderedBody, req.SystemPrompt, req.Model, req.Config)

	// Get provider adapter
	adapter, err := e.getAdapter(ctx, orgID, req.Provider)
	if err != nil {
		return fmt.Errorf("get provider adapter: %w", err)
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming not supported")
	}

	start := time.Now()

	// Get streaming response
	body, err := adapter.ChatCompletionStream(ctx, chatReq)
	if err != nil {
		return fmt.Errorf("chat completion stream: %w", err)
	}
	defer body.Close()

	// Parse SSE stream from provider and re-emit to client
	scanner := bufio.NewScanner(body)
	var totalOutput strings.Builder
	tokensIn := 0
	tokensOut := 0

	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines
		if line == "" {
			continue
		}

		// Handle SSE data lines
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")

		// Handle stream termination
		if data == "[DONE]" {
			break
		}

		// Parse the chunk
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		// Extract content from the chunk
		if len(chunk.Choices) > 0 {
			delta := chunk.Choices[0].Delta
			if content, ok := delta.Content.(string); ok && content != "" {
				totalOutput.WriteString(content)
				tokensOut++

				// Emit token to client
				tokenEvent := map[string]interface{}{
					"type":    "token",
					"content": content,
				}
				eventData, _ := json.Marshal(tokenEvent)
				fmt.Fprintf(w, "data: %s\n\n", eventData)
				flusher.Flush()
			}
		}

		// Capture usage if present
		if chunk.Usage != nil {
			tokensIn = chunk.Usage.PromptTokens
			tokensOut = chunk.Usage.CompletionTokens
		}
	}

	latencyMs := int(time.Since(start).Milliseconds())

	// Emit done event
	doneEvent := map[string]interface{}{
		"type":       "done",
		"tokens_in":  tokensIn,
		"tokens_out": tokensOut,
		"cost_cents": 0,
		"latency_ms": latencyMs,
	}
	doneData, _ := json.Marshal(doneEvent)
	fmt.Fprintf(w, "data: %s\n\n", doneData)
	flusher.Flush()

	return nil
}

// Compare runs the same prompt against multiple models in parallel.
func (e *Executor) Compare(ctx context.Context, orgID string, req CompareRequest) (*CompareResult, error) {
	if len(req.Models) == 0 {
		return nil, fmt.Errorf("at least one model is required")
	}
	if len(req.Models) > 4 {
		return nil, fmt.Errorf("maximum 4 models for comparison")
	}

	results := make([]ExecuteResult, len(req.Models))
	errs := make([]error, len(req.Models))

	var wg sync.WaitGroup
	for i, mc := range req.Models {
		wg.Add(1)
		go func(idx int, modelCfg CompareModelConfig) {
			defer wg.Done()
			execReq := ExecuteRequest{
				Body:         req.Body,
				SystemPrompt: req.SystemPrompt,
				Variables:    req.Variables,
				Model:        modelCfg.Model,
				Provider:     modelCfg.Provider,
				Config:       req.Config,
				Stream:       false,
			}
			result, err := e.Execute(ctx, orgID, execReq)
			if err != nil {
				errs[idx] = err
				results[idx] = ExecuteResult{
					Model:    modelCfg.Model,
					Provider: modelCfg.Provider,
					Output:   fmt.Sprintf("Error: %v", err),
				}
				return
			}
			results[idx] = *result
		}(i, mc)
	}

	wg.Wait()

	return &CompareResult{Results: results}, nil
}

// buildChatRequest constructs the provider ChatRequest.
func (e *Executor) buildChatRequest(body, systemPrompt, model string, cfg ExecuteConfig) *provider.ChatRequest {
	var messages []provider.ChatMessage

	if systemPrompt != "" {
		messages = append(messages, provider.ChatMessage{
			Role:    "system",
			Content: systemPrompt,
		})
	}

	messages = append(messages, provider.ChatMessage{
		Role:    "user",
		Content: body,
	})

	req := &provider.ChatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: cfg.Temperature,
		TopP:        cfg.TopP,
		MaxTokens:   cfg.MaxTokens,
	}

	return req
}

// getAdapter retrieves the provider's API key and creates a provider adapter.
func (e *Executor) getAdapter(ctx context.Context, orgID, providerName string) (provider.Provider, error) {
	// Look up the provider in the database
	p, err := e.routeStore.GetProviderByName(ctx, orgID, providerName)
	if err != nil {
		return nil, fmt.Errorf("lookup provider %q: %w", providerName, err)
	}
	if p == nil {
		return nil, fmt.Errorf("provider %q not configured for this organization", providerName)
	}
	if !p.IsEnabled {
		return nil, fmt.Errorf("provider %q is disabled", providerName)
	}

	// Decrypt the API key
	apiKey, err := e.encSvc.Decrypt(p.APIKeyEncrypted, p.APIKeyNonce)
	if err != nil {
		return nil, fmt.Errorf("decrypt provider API key: %w", err)
	}

	// Create adapter
	cfg := provider.AdapterConfig{
		APIKey:  apiKey,
		BaseURL: p.BaseURL,
	}

	adapter, err := provider.NewAdapter(providerName, cfg)
	if err != nil {
		return nil, fmt.Errorf("create adapter: %w", err)
	}

	return adapter, nil
}

// streamChunk represents a single chunk in an SSE stream from an LLM provider.
type streamChunk struct {
	ID      string              `json:"id"`
	Object  string              `json:"object"`
	Created int64               `json:"created"`
	Model   string              `json:"model"`
	Choices []streamChunkChoice `json:"choices"`
	Usage   *provider.Usage     `json:"usage,omitempty"`
}

type streamChunkChoice struct {
	Index        int                  `json:"index"`
	Delta        provider.ChatMessage `json:"delta"`
	FinishReason *string              `json:"finish_reason"`
}

