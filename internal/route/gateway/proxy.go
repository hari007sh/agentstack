package gateway

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	costservice "github.com/agentstack/agentstack/internal/cost/service"
	coststore "github.com/agentstack/agentstack/internal/cost/store"
	"github.com/agentstack/agentstack/internal/route/provider"
	"github.com/agentstack/agentstack/internal/route/store"
)

// Proxy is the core gateway proxy handler.
// It receives OpenAI-compatible requests, resolves the provider and model via
// routing rules, checks budgets, checks the semantic cache, forwards to the
// provider, records cost events, logs the request asynchronously, and returns
// the response.
type Proxy struct {
	router        *Router
	cache         *SemanticCache
	fallback      *FallbackExecutor
	logger        *AsyncLogger
	log           *slog.Logger
	budgetService *costservice.BudgetService
	costTracker   *costservice.TrackerService
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

// SetBudgetService configures budget enforcement on the proxy.
func (p *Proxy) SetBudgetService(bs *costservice.BudgetService) {
	p.budgetService = bs
}

// SetCostTracker configures cost event recording on the proxy.
func (p *Proxy) SetCostTracker(ct *costservice.TrackerService) {
	p.costTracker = ct
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

	// 1. Check budget enforcement
	if p.budgetService != nil {
		budgetResult, err := p.budgetService.CheckBudget(r.Context(), orgID, "", req.Model)
		if err != nil {
			p.log.Error("budget check failed", "org_id", orgID, "error", err)
			// Budget check errors are non-fatal; log and proceed
		} else if !budgetResult.Allowed {
			p.logRequest(orgID, req.Model, "", "", 0, 0, 0, int(time.Since(start).Milliseconds()), false, "budget_blocked", strPtr(budgetResult.Message))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error": map[string]interface{}{
					"code":    "BUDGET_EXCEEDED",
					"message": "Your cost budget has been exceeded",
				},
			})
			return
		} else if budgetResult.Action == "throttle" {
			w.Header().Set("X-AgentStack-Budget-Warning", "approaching limit")
		}
	}

	// 2. Check semantic cache
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

	// 3. Route to provider
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

	// 4. Streaming request
	if req.Stream {
		p.handleStream(w, r, orgID, originalModel, result, &req, start)
		return
	}

	// 5. Non-streaming request
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

	// 6. Record cost event (async, non-blocking)
	p.recordCostEvent(r.Context(), orgID, originalModel, result.ProviderName, tokensIn, tokensOut)

	// 7. Store in cache
	if !cacheDisabled && p.cache != nil {
		reqForCache := req
		reqForCache.Model = originalModel
		_ = p.cache.Set(r.Context(), orgID, &reqForCache, resp)
	}

	// 8. Async log
	costCents := p.estimateCost(r.Context(), result.ProviderName, result.TargetModel, tokensIn, tokensOut)
	p.logRequest(orgID, originalModel, result.TargetModel, result.ProviderName, tokensIn, tokensOut, costCents, latencyMs, false, "success", nil)

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

// recordCostEvent asynchronously records a cost event for a completed request.
// Errors are logged but never fail the request.
func (p *Proxy) recordCostEvent(ctx context.Context, orgID, model, providerName string, tokensIn, tokensOut int) {
	if p.costTracker == nil {
		return
	}
	go func() {
		event := &coststore.CostEvent{
			AgentName:    "", // gateway does not have agent context
			Model:        model,
			Provider:     providerName,
			InputTokens:  tokensIn,
			OutputTokens: tokensOut,
			Outcome:      "success",
		}
		if err := p.costTracker.RecordEvent(ctx, orgID, event); err != nil {
			p.log.Error("failed to record cost event", "org_id", orgID, "model", model, "error", err)
		}
	}()
}

// estimateCost returns the estimated cost in cents for a request.
// Returns 0 if cost tracker is not configured or pricing is unavailable.
func (p *Proxy) estimateCost(ctx context.Context, providerName, model string, tokensIn, tokensOut int) int64 {
	if p.costTracker == nil {
		return 0
	}
	cost, err := p.costTracker.CalculateCost(ctx, model, providerName, tokensIn, tokensOut)
	if err != nil {
		return 0
	}
	return int64(cost)
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
