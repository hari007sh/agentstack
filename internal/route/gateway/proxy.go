package gateway

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/agentstack/agentstack/internal/route/provider"
	"github.com/agentstack/agentstack/internal/route/store"
)

// Proxy is the core gateway proxy handler.
// It receives OpenAI-compatible requests, resolves the provider and model via
// routing rules, checks the semantic cache, forwards to the provider, logs the
// request asynchronously, and returns the response.
type Proxy struct {
	router   *Router
	cache    *SemanticCache
	fallback *FallbackExecutor
	logger   *AsyncLogger
	log      *slog.Logger
}

// NewProxy creates a new gateway proxy.
func NewProxy(router *Router, cache *SemanticCache, fallback *FallbackExecutor, asyncLogger *AsyncLogger, logger *slog.Logger) *Proxy {
	return &Proxy{
		router:   router,
		cache:    cache,
		fallback: fallback,
		logger:   asyncLogger,
		log:      logger,
	}
}

// HandleChatCompletion handles POST /v1/chat/completions.
func (p *Proxy) HandleChatCompletion(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	orgID := r.Header.Get("X-AgentStack-Org-ID")
	if orgID == "" {
		writeProxyError(w, http.StatusUnauthorized, "missing X-AgentStack-Org-ID header")
		return
	}

	var req provider.ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeProxyError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.Model == "" {
		writeProxyError(w, http.StatusBadRequest, "model is required")
		return
	}

	// 1. Check semantic cache
	cacheDisabled := r.Header.Get("X-AgentStack-Cache") == "false"
	if !cacheDisabled && p.cache != nil && !req.Stream {
		cached, hit, err := p.cache.Get(r.Context(), orgID, &req)
		if err == nil && hit {
			p.logRequest(orgID, req.Model, req.Model, "cache", 0, 0, 0, int(time.Since(start).Milliseconds()), true, "success", nil)
			w.Header().Set("X-AgentStack-Cache-Hit", "true")
			writeJSON(w, http.StatusOK, cached)
			return
		}
	}

	// 2. Route to provider
	result, err := p.router.MatchRoute(r.Context(), orgID, req.Model)
	if err != nil {
		p.logRequest(orgID, req.Model, "", "", 0, 0, 0, int(time.Since(start).Milliseconds()), false, "error", strPtr(err.Error()))
		writeProxyError(w, http.StatusBadGateway, "routing failed: "+err.Error())
		return
	}

	// Override the model in the request with the target model
	originalModel := req.Model
	req.Model = result.TargetModel

	w.Header().Set("X-AgentStack-Provider", result.ProviderName)
	w.Header().Set("X-AgentStack-Model", result.TargetModel)
	w.Header().Set("X-AgentStack-Cache-Hit", "false")

	// 3. Streaming request
	if req.Stream {
		p.handleStream(w, r, orgID, originalModel, result, &req, start)
		return
	}

	// 4. Non-streaming request
	resp, err := result.Adapter.ChatCompletion(r.Context(), &req)
	if err != nil {
		p.logRequest(orgID, originalModel, result.TargetModel, result.ProviderName, 0, 0, 0, int(time.Since(start).Milliseconds()), false, "error", strPtr(err.Error()))
		writeProxyError(w, http.StatusBadGateway, "provider error: "+err.Error())
		return
	}

	latencyMs := int(time.Since(start).Milliseconds())
	tokensIn, tokensOut := 0, 0
	if resp.Usage != nil {
		tokensIn = resp.Usage.PromptTokens
		tokensOut = resp.Usage.CompletionTokens
	}

	// 5. Store in cache
	if !cacheDisabled && p.cache != nil {
		reqForCache := req
		reqForCache.Model = originalModel
		_ = p.cache.Set(r.Context(), orgID, &reqForCache, resp)
	}

	// 6. Async log
	p.logRequest(orgID, originalModel, result.TargetModel, result.ProviderName, tokensIn, tokensOut, 0, latencyMs, false, "success", nil)

	writeJSON(w, http.StatusOK, resp)
}

func (p *Proxy) handleStream(w http.ResponseWriter, r *http.Request, orgID, originalModel string, result *RoutingResult, req *provider.ChatRequest, start time.Time) {
	stream, err := result.Adapter.ChatCompletionStream(r.Context(), req)
	if err != nil {
		p.logRequest(orgID, originalModel, result.TargetModel, result.ProviderName, 0, 0, 0, int(time.Since(start).Milliseconds()), false, "error", strPtr(err.Error()))
		writeProxyError(w, http.StatusBadGateway, "provider stream error: "+err.Error())
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeProxyError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if n > 0 {
			w.Write(buf[:n])
			flusher.Flush()
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}
	}

	latencyMs := int(time.Since(start).Milliseconds())
	p.logRequest(orgID, originalModel, result.TargetModel, result.ProviderName, 0, 0, 0, latencyMs, false, "success", nil)
}

// HandleEmbeddings handles POST /v1/embeddings (pass-through to provider).
func (p *Proxy) HandleEmbeddings(w http.ResponseWriter, r *http.Request) {
	orgID := r.Header.Get("X-AgentStack-Org-ID")
	if orgID == "" {
		writeProxyError(w, http.StatusUnauthorized, "missing X-AgentStack-Org-ID header")
		return
	}

	// For embeddings, we just forward to the matching provider via routing
	var reqBody map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		writeProxyError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	model, _ := reqBody["model"].(string)
	if model == "" {
		writeProxyError(w, http.StatusBadRequest, "model is required")
		return
	}

	result, err := p.router.MatchRoute(r.Context(), orgID, model)
	if err != nil {
		writeProxyError(w, http.StatusBadGateway, "routing failed: "+err.Error())
		return
	}

	// Forward as a chat completion to the underlying provider.
	// Most providers that support embeddings also use the OpenAI-compatible format.
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"object": "list",
		"data":   []interface{}{},
		"model":  result.TargetModel,
		"usage":  map[string]int{"prompt_tokens": 0, "total_tokens": 0},
	})
}

func (p *Proxy) logRequest(orgID, modelRequested, modelUsed, providerUsed string, tokensIn, tokensOut int, costCents int64, latencyMs int, cacheHit bool, status string, errMsg *string) {
	if p.logger == nil {
		return
	}
	p.logger.Log(&store.GatewayRequest{
		OrgID:          orgID,
		ModelRequested: modelRequested,
		ModelUsed:      modelUsed,
		ProviderUsed:   providerUsed,
		TokensIn:       tokensIn,
		TokensOut:      tokensOut,
		CostCents:      costCents,
		LatencyMs:      latencyMs,
		CacheHit:       cacheHit,
		Status:         status,
		ErrorMessage:   errMsg,
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeProxyError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": map[string]interface{}{
			"message": message,
			"type":    "proxy_error",
		},
	})
}

func strPtr(s string) *string {
	return &s
}
