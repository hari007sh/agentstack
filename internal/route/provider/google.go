package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// GoogleAdapter implements Provider for the Google Gemini API.
// It translates between OpenAI-compatible format and Gemini's native format.
type GoogleAdapter struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewGoogleAdapter creates a new Google Gemini adapter.
func NewGoogleAdapter(cfg AdapterConfig) *GoogleAdapter {
	base := "https://generativelanguage.googleapis.com"
	if cfg.BaseURL != "" {
		base = cfg.BaseURL
	}
	return &GoogleAdapter{
		apiKey:     cfg.APIKey,
		baseURL:    base,
		httpClient: httpClient(cfg),
	}
}

func (a *GoogleAdapter) Name() string { return "google" }

type geminiRequest struct {
	Contents         []geminiContent        `json:"contents"`
	SystemInstruction *geminiContent        `json:"systemInstruction,omitempty"`
	GenerationConfig *geminiGenerationConfig `json:"generationConfig,omitempty"`
}

type geminiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}

type geminiGenerationConfig struct {
	Temperature *float64 `json:"temperature,omitempty"`
	MaxOutputTokens *int `json:"maxOutputTokens,omitempty"`
	TopP        *float64 `json:"topP,omitempty"`
}

type geminiResponse struct {
	Candidates []geminiCandidate `json:"candidates"`
	UsageMetadata *geminiUsage  `json:"usageMetadata,omitempty"`
}

type geminiCandidate struct {
	Content      geminiContent `json:"content"`
	FinishReason string        `json:"finishReason"`
}

type geminiUsage struct {
	PromptTokenCount     int `json:"promptTokenCount"`
	CandidatesTokenCount int `json:"candidatesTokenCount"`
	TotalTokenCount      int `json:"totalTokenCount"`
}

func (a *GoogleAdapter) ChatCompletion(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	gReq := a.toGeminiRequest(req)

	body, err := json.Marshal(gReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1beta/models/%s:generateContent?key=%s", a.baseURL, req.Model, a.apiKey)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, &ProviderError{StatusCode: resp.StatusCode, Body: string(respBody), ProviderName: "google"}
	}

	var gResp geminiResponse
	if err := json.NewDecoder(resp.Body).Decode(&gResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return a.toOpenAIResponse(req.Model, &gResp), nil
}

func (a *GoogleAdapter) ChatCompletionStream(ctx context.Context, req *ChatRequest) (io.ReadCloser, error) {
	gReq := a.toGeminiRequest(req)

	body, err := json.Marshal(gReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1beta/models/%s:streamGenerateContent?key=%s&alt=sse", a.baseURL, req.Model, a.apiKey)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := a.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		return nil, &ProviderError{StatusCode: resp.StatusCode, Body: string(respBody), ProviderName: "google"}
	}
	return resp.Body, nil
}

func (a *GoogleAdapter) toGeminiRequest(req *ChatRequest) *geminiRequest {
	gr := &geminiRequest{}

	if req.Temperature != nil || req.MaxTokens != nil || req.TopP != nil {
		gr.GenerationConfig = &geminiGenerationConfig{
			Temperature:     req.Temperature,
			MaxOutputTokens: req.MaxTokens,
			TopP:            req.TopP,
		}
	}

	for _, msg := range req.Messages {
		content := contentToString(msg.Content)
		if msg.Role == "system" {
			gr.SystemInstruction = &geminiContent{
				Parts: []geminiPart{{Text: content}},
			}
			continue
		}
		role := msg.Role
		if role == "assistant" {
			role = "model"
		}
		gr.Contents = append(gr.Contents, geminiContent{
			Role:  role,
			Parts: []geminiPart{{Text: content}},
		})
	}
	return gr
}

func (a *GoogleAdapter) toOpenAIResponse(model string, resp *geminiResponse) *ChatResponse {
	cr := &ChatResponse{
		ID:      fmt.Sprintf("gemini-%d", time.Now().UnixNano()),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   model,
	}

	for i, cand := range resp.Candidates {
		text := ""
		for _, p := range cand.Content.Parts {
			text += p.Text
		}
		cr.Choices = append(cr.Choices, ChatChoice{
			Index: i,
			Message: ChatMessage{
				Role:    "assistant",
				Content: text,
			},
			FinishReason: "stop",
		})
	}

	if resp.UsageMetadata != nil {
		cr.Usage = &Usage{
			PromptTokens:     resp.UsageMetadata.PromptTokenCount,
			CompletionTokens: resp.UsageMetadata.CandidatesTokenCount,
			TotalTokens:      resp.UsageMetadata.TotalTokenCount,
		}
	}
	return cr
}
