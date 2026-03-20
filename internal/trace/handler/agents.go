package handler

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/agentstack/agentstack/internal/server/httputil"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/agentstack/agentstack/internal/trace/store"
	"github.com/go-chi/chi/v5"
)

// AgentHandler handles agent definition CRUD endpoints.
type AgentHandler struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewAgentHandler creates a new agent handler.
func NewAgentHandler(pg *store.PostgresStore, logger *slog.Logger) *AgentHandler {
	return &AgentHandler{pg: pg, logger: logger}
}

// createAgentRequest is the request body for creating an agent.
type createAgentRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Framework   string          `json:"framework"`
	Metadata    json.RawMessage `json:"metadata"`
}

// updateAgentRequest is the request body for updating an agent.
type updateAgentRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Framework   string          `json:"framework"`
	Metadata    json.RawMessage `json:"metadata"`
}

// List handles GET /v1/agents.
func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	agents, err := h.pg.ListAgents(r.Context(), orgID)
	if err != nil {
		h.logger.Error("failed to list agents", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to list agents")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"agents": agents,
	})
}

// Get handles GET /v1/agents/{id}.
func (h *AgentHandler) Get(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "agent ID is required")
		return
	}

	agent, err := h.pg.GetAgent(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get agent", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get agent")
		return
	}
	if agent == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "agent not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, agent)
}

// Create handles POST /v1/agents.
func (h *AgentHandler) Create(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req createAgentRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "name is required")
		return
	}

	if req.Metadata == nil {
		req.Metadata = json.RawMessage("{}")
	}

	agent := &store.Agent{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Framework:   req.Framework,
		Metadata:    req.Metadata,
	}

	if err := h.pg.CreateAgent(r.Context(), agent); err != nil {
		h.logger.Error("failed to create agent", "org_id", orgID, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "CREATE_ERROR", "failed to create agent")
		return
	}

	h.logger.Info("created agent", "id", agent.ID, "name", agent.Name, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusCreated, agent)
}

// Update handles PUT /v1/agents/{id}.
func (h *AgentHandler) Update(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "agent ID is required")
		return
	}

	var req updateAgentRequest
	if err := httputil.ReadJSON(r, &req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid JSON request body")
		return
	}

	existing, err := h.pg.GetAgent(r.Context(), orgID, id)
	if err != nil {
		h.logger.Error("failed to get agent for update", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "QUERY_ERROR", "failed to get agent")
		return
	}
	if existing == nil {
		httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "agent not found")
		return
	}

	// Apply partial updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Framework != "" {
		existing.Framework = req.Framework
	}
	if req.Metadata != nil {
		existing.Metadata = req.Metadata
	}

	if err := h.pg.UpdateAgent(r.Context(), existing); err != nil {
		h.logger.Error("failed to update agent", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "UPDATE_ERROR", "failed to update agent")
		return
	}

	h.logger.Info("updated agent", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /v1/agents/{id}.
func (h *AgentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "agent ID is required")
		return
	}

	if err := h.pg.DeleteAgent(r.Context(), orgID, id); err != nil {
		if err == sql.ErrNoRows {
			httputil.WriteError(w, http.StatusNotFound, "NOT_FOUND", "agent not found")
			return
		}
		h.logger.Error("failed to delete agent", "id", id, "error", err)
		httputil.WriteError(w, http.StatusInternalServerError, "DELETE_ERROR", "failed to delete agent")
		return
	}

	h.logger.Info("deleted agent", "id", id, "org_id", orgID)
	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
	})
}
