package service

import (
	"fmt"
	"math/rand"
)

// LLMClient provides an interface to call LLM APIs for judge-based evaluations.
// In production, this would make real HTTP requests to an LLM provider (OpenAI, Anthropic, etc.)
// using the user's configured API key. For now, it returns simulated scores with reasoning.
type LLMClient struct {
	apiEndpoint string
	apiKey      string
	model       string
}

// NewLLMClient creates a new LLM client for evaluator judge calls.
func NewLLMClient(apiEndpoint, apiKey string) *LLMClient {
	if apiEndpoint == "" {
		apiEndpoint = "https://api.openai.com/v1"
	}
	return &LLMClient{
		apiEndpoint: apiEndpoint,
		apiKey:      apiKey,
	}
}

// LLMRequest holds the parameters for an LLM judge call.
type LLMRequest struct {
	Model        string `json:"model"`
	SystemPrompt string `json:"system_prompt"`
	UserPrompt   string `json:"user_prompt"`
}

// LLMResponse holds the response from an LLM judge call.
type LLMResponse struct {
	Text  string  `json:"text"`
	Score float64 `json:"score"`
}

// Call sends a request to the LLM API and returns the response.
// This is currently a stub that returns a simulated score with reasoning.
// In production, this would:
//  1. Build an HTTP request to cfg.apiEndpoint/chat/completions
//  2. Send the system prompt and user prompt
//  3. Parse the response for a score (0-1) and reasoning text
//  4. Return the result
func (c *LLMClient) Call(req LLMRequest) (*LLMResponse, error) {
	if req.Model == "" {
		req.Model = "gpt-4o"
	}

	// Stub: simulate an LLM judge response.
	// Score is randomized between 0.65 and 0.98 to simulate realistic variation.
	score := 0.65 + rand.Float64()*0.33

	reasoning := fmt.Sprintf(
		"[Stub LLM Judge] Model %s evaluated the output. "+
			"The response demonstrates adequate quality with a score of %.2f. "+
			"In production, this would be a real LLM evaluation using the configured API endpoint (%s).",
		req.Model, score, c.apiEndpoint,
	)

	return &LLMResponse{
		Text:  reasoning,
		Score: score,
	}, nil
}

// SetModel configures the default model for this client.
func (c *LLMClient) SetModel(model string) {
	c.model = model
}

// SetAPIKey updates the API key for this client.
func (c *LLMClient) SetAPIKey(key string) {
	c.apiKey = key
}
