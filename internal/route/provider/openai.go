package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// OpenAIAdapter implements Provider for the OpenAI API.
type OpenAIAdapter struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
	headers    map[string]string
}

// NewOpenAIAdapter creates an adapter for OpenAI or any OpenAI-compatible endpoint.
func NewOpenAIAdapter(cfg AdapterConfig) *OpenAIAdapter {
	base := "https://api.openai.com"
	if cfg.BaseURL != "" {
		base = cfg.BaseURL
	}
	return &OpenAIAdapter{
		apiKey:     cfg.APIKey,
		baseURL:    base,
		httpClient: httpClient(cfg),
		headers:    cfg.Headers,
	}
}

func (a *OpenAIAdapter) Name() string { return "openai" }

func (a *OpenAIAdapter) ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	a.setHeaders(httpReq)

	resp, err := a.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, &ProviderError{StatusCode: resp.StatusCode, Body: string(respBody), ProviderName: "openai"}
	}

	var result ChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func (a *OpenAIAdapter) ChatCompletionStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error) {
	streamReq := *req
	streamReq.Stream = true
	body, err := json.Marshal(streamReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	a.setHeaders(httpReq)

	resp, err := a.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		return nil, &ProviderError{StatusCode: resp.StatusCode, Body: string(respBody), ProviderName: "openai"}
	}
	return resp.Body, nil
}

func (a *OpenAIAdapter) setHeaders(r *http.Request) {
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+a.apiKey)
	for k, v := range a.headers {
		r.Header.Set(k, v)
	}
}
