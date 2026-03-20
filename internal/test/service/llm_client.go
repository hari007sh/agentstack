package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// LLMClient provides an interface to call LLM APIs for judge-based evaluations.
// When configured with a valid API key, it makes real HTTP requests to an
// OpenAI-compatible LLM provider. When no API key is set, IsConfigured()
// returns false and the evaluator should fall back to a neutral score.
type LLMClient struct {
	apiEndpoint string
	apiKey      string
	model       string
	httpClient  *http.Client
}

// NewLLMClient creates a new LLM client for evaluator judge calls.
func NewLLMClient(apiEndpoint, apiKey string) *LLMClient {
	if apiEndpoint == "" {
		apiEndpoint = "https://api.openai.com/v1"
	}
	return &LLMClient{
		apiEndpoint: apiEndpoint,
		apiKey:      apiKey,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// IsConfigured returns true if the client has a valid API key set.
func (c *LLMClient) IsConfigured() bool {
	return c.apiKey != ""
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

// openAIChatRequest is the request body for the OpenAI chat completions API.
type openAIChatRequest struct {
	Model    string              `json:"model"`
	Messages []openAIChatMessage `json:"messages"`
}

// openAIChatMessage is a single message in the chat completions request.
type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// openAIChatResponse is the response body from the OpenAI chat completions API.
type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Call sends a request to the LLM API and returns the response.
// It calls an OpenAI-compatible chat completions endpoint, sends the system
// and user prompts, and parses the response for a score and reasoning.
func (c *LLMClient) Call(req LLMRequest) (*LLMResponse, error) {
	if !c.IsConfigured() {
		return nil, fmt.Errorf("LLM client is not configured: missing API key")
	}

	if req.Model == "" {
		req.Model = "gpt-4o"
		if c.model != "" {
			req.Model = c.model
		}
	}

	// Build the OpenAI-compatible request body.
	chatReq := openAIChatRequest{
		Model: req.Model,
		Messages: []openAIChatMessage{
			{Role: "system", Content: req.SystemPrompt},
			{Role: "user", Content: req.UserPrompt},
		},
	}

	body, err := json.Marshal(chatReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	endpoint := c.apiEndpoint + "/chat/completions"
	httpReq, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("LLM API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LLM API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse the OpenAI chat response.
	var chatResp openAIChatResponse
	if err := json.Unmarshal(respBody, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("LLM API returned no choices")
	}

	content := chatResp.Choices[0].Message.Content

	// Try to parse the content as a JSON object with score and reasoning.
	var judgeResult struct {
		Score     float64 `json:"score"`
		Reasoning string  `json:"reasoning"`
	}
	if err := json.Unmarshal([]byte(content), &judgeResult); err == nil {
		return &LLMResponse{
			Text:  judgeResult.Reasoning,
			Score: judgeResult.Score,
		}, nil
	}

	// If we can't parse as JSON, try to extract a score from the text.
	// This handles cases where the LLM returns text instead of JSON.
	return &LLMResponse{
		Text:  content,
		Score: 0.5, // neutral score when we can't parse the response
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
