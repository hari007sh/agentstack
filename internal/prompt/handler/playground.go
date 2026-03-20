package handler

import (
	"log/slog"
	"net/http"
	"strconv"

	"github.com/agentstack/agentstack/internal/prompt/service"
	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
)

// PlaygroundHandler handles playground execution endpoints.
type PlaygroundHandler struct {
	executor    *service.Executor
	promptSvc   *service.PromptService
	renderer    *service.Renderer
	logger      *slog.Logger
}

// NewPlaygroundHandler creates a new playground handler.
func NewPlaygroundHandler(executor *service.Executor, promptSvc *service.PromptService, logger *slog.Logger) *PlaygroundHandler {
	return &PlaygroundHandler{
		executor:  executor,
		promptSvc: promptSvc,
		renderer:  service.NewRenderer(),
		logger:    logger,
	}
}

// executeRequest is the request body for playground execution.
type executeRequest struct {
	PromptID     string                 `json:"prompt_id"`
	Body         string                 `json:"body"`
	SystemPrompt string                 `json:"system_prompt"`
	Variables    map[string]interface{} `json:"variables"`
	Model        string                 `json:"model"`
	Provider     string                 `json:"provider"`
	Config       service.ExecuteConfig  `json:"config"`
	Stream       bool                   `json:"stream"`
}

// compareRequest is the request body for model comparison.
type compareRequest struct {
	Body         string                       `json:"body"`
	SystemPrompt string                       `json:"system_prompt"`
	Variables    map[string]interface{}       `json:"variables"`
	Models       []service.CompareModelConfig `json:"models"`
	Config       service.ExecuteConfig        `json:"config"`
}

// Execute handles POST /v1/playground/execute.
func (h *PlaygroundHandler) Execute(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req executeRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// If prompt_id is provided, load the prompt body
	if req.PromptID != "" {
		prompt, err := h.promptSvc.GetPrompt(r.Context(), orgID, req.PromptID)
		if err != nil {
			h.logger.Error("failed to load prompt for playground", "org_id", orgID, "prompt_id", req.PromptID, "error", err)
			httputil.WriteError(w, http.StatusInternalServerError, "PROMPT_ERROR", "failed to load prompt")
			return
		}
		if prompt == nil {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "prompt not found")
			return
		}
		// Use prompt body if not explicitly provided
		if req.Body == "" {
			req.Body = prompt.ActiveBody
		}
		if req.SystemPrompt == "" {
			req.SystemPrompt = prompt.ActiveSystemPrompt
		}
		if req.Model == "" {
			req.Model = prompt.ActiveModel
		}
	}

	// Validate required fields
	if req.Body == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "body is required")
		return
	}
	if req.Model == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "model is required")
		return
	}
	if req.Provider == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "provider is required")
		return
	}

	execReq := service.ExecuteRequest{
		PromptID:     req.PromptID,
		Body:         req.Body,
		SystemPrompt: req.SystemPrompt,
		Variables:    req.Variables,
		Model:        req.Model,
		Provider:     req.Provider,
		Config:       req.Config,
		Stream:       req.Stream,
	}

	// Streaming response
	if req.Stream {
		if err := h.executor.ExecuteStream(r.Context(), orgID, execReq, w); err != nil {
			h.logger.Error("streaming execution failed", "org_id", orgID, "error", err)
			// If Content-Type hasn't been set to text/event-stream yet,
			// the headers haven't been flushed — safe to write a JSON error.
			if w.Header().Get("Content-Type") != "text/event-stream" {
				httputil.WriteError(w, http.StatusInternalServerError, "EXECUTION_ERROR", err.Error())
			}
			return
		}
		return
	}

	// Non-streaming response
	result, err := h.executor.Execute(r.Context(), orgID, execReq)
	if err != nil {
		h.logger.Error("execution failed", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "EXECUTION_ERROR", err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": result,
	})
}

// Compare handles POST /v1/playground/compare.
func (h *PlaygroundHandler) Compare(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req compareRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	// Validate required fields
	if req.Body == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "body is required")
		return
	}
	if len(req.Models) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "at least one model is required")
		return
	}
	if len(req.Models) > 4 {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "maximum 4 models for comparison")
		return
	}

	for i, m := range req.Models {
		if m.Model == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"model is required for entry at index "+strconv.Itoa(i))
			return
		}
		if m.Provider == "" {
			httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR",
				"provider is required for entry at index "+strconv.Itoa(i))
			return
		}
	}

	compareReq := service.CompareRequest{
		Body:         req.Body,
		SystemPrompt: req.SystemPrompt,
		Variables:    req.Variables,
		Models:       req.Models,
		Config:       req.Config,
	}

	result, err := h.executor.Compare(r.Context(), orgID, compareReq)
	if err != nil {
		h.logger.Error("comparison failed", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "COMPARE_ERROR", err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"data": result,
	})
}

