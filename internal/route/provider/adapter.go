// Package provider defines the common interface and factory for LLM provider adapters.
package provider

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ChatRequest is the unified request format (OpenAI-compatible).
type ChatRequest struct {
	Model            string                   `json:"model"`
	Messages         []ChatMessage            `json:"messages"`
	Temperature      *float64                 `json:"temperature,omitempty"`
	TopP             *float64                 `json:"top_p,omitempty"`
	N                *int                     `json:"n,omitempty"`
	Stream           bool                     `json:"stream,omitempty"`
	Stop             interface{}              `json:"stop,omitempty"`
	MaxTokens        *int                     `json:"max_tokens,omitempty"`
	PresencePenalty  *float64                 `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64                 `json:"frequency_penalty,omitempty"`
	User             string                   `json:"user,omitempty"`
	Tools            []Tool                   `json:"tools,omitempty"`
	ToolChoice       interface{}              `json:"tool_choice,omitempty"`
	ResponseFormat   *ResponseFormat          `json:"response_format,omitempty"`
	Seed             *int                     `json:"seed,omitempty"`
}

// ChatMessage represents a message in the conversation.
type ChatMessage struct {
	Role       string      `json:"role"`
	Content    interface{} `json:"content"`
	Name       string      `json:"name,omitempty"`
	ToolCalls  []ToolCall  `json:"tool_calls,omitempty"`
	ToolCallID string      `json:"tool_call_id,omitempty"`
}

// Tool represents a tool definition.
type Tool struct {
	Type     string   `json:"type"`
	Function Function `json:"function"`
}

// Function defines a callable function.
type Function struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	Parameters  interface{} `json:"parameters,omitempty"`
}

// ToolCall represents a tool invocation by the model.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall holds a function call name and arguments.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// ResponseFormat specifies the desired response format.
type ResponseFormat struct {
	Type string `json:"type"`
}

// ChatResponse is the unified response format (OpenAI-compatible).
type ChatResponse struct {
	ID                string       `json:"id"`
	Object            string       `json:"object"`
	Created           int64        `json:"created"`
	Model             string       `json:"model"`
	Choices           []ChatChoice `json:"choices"`
	Usage             *Usage       `json:"usage,omitempty"`
	SystemFingerprint string       `json:"system_fingerprint,omitempty"`
}

// ChatChoice represents one choice in a chat completion response.
type ChatChoice struct {
	Index        int         `json:"index"`
	Message      ChatMessage `json:"message"`
	FinishReason string      `json:"finish_reason"`
}

// Usage reports token consumption.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Provider is the common interface for all LLM provider adapters.
type Provider interface {
	// ChatCompletion sends a non-streaming chat completion request.
	ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error)

	// ChatCompletionStream sends a streaming request and returns the raw SSE body.
	ChatCompletionStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error)

	// Name returns the provider identifier.
	Name() string
}

// ProviderError represents an error from a provider API.
type ProviderError struct {
	StatusCode int
	Body       string
	ProviderName string
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("provider %s returned status %d: %s", e.ProviderName, e.StatusCode, e.Body)
}

// IsRetryable reports whether the error is transient and the request should be retried.
func (e *ProviderError) IsRetryable() bool {
	return e.StatusCode == http.StatusTooManyRequests || e.StatusCode >= http.StatusInternalServerError
}

// AdapterConfig holds the configuration for creating a provider adapter.
type AdapterConfig struct {
	APIKey     string
	BaseURL    string
	TimeoutMs  int
	Headers    map[string]string
	MaxRetries int
}

func httpClient(cfg AdapterConfig) *http.Client {
	timeout := time.Duration(cfg.TimeoutMs) * time.Millisecond
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &http.Client{Timeout: timeout}
}

// NewAdapter creates a provider adapter by name.
func NewAdapter(name string, cfg AdapterConfig) (Provider, error) {
	switch name {
	case "openai":
		return NewOpenAIAdapter(cfg), nil
	case "anthropic":
		return NewAnthropicAdapter(cfg), nil
	case "google":
		return NewGoogleAdapter(cfg), nil
	case "together":
		return NewTogetherAdapter(cfg), nil
	case "groq":
		return NewGroqAdapter(cfg), nil
	case "mistral":
		return NewMistralAdapter(cfg), nil
	default:
		// Custom/unknown providers are assumed to be OpenAI-compatible.
		return NewOpenAIAdapter(cfg), nil
	}
}
