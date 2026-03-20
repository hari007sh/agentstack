package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/agentstack/agentstack/internal/auth"
	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"
)

// apiKeyResponse is the JSON response for a single API key (without the raw key).
type apiKeyResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	KeyPrefix   string   `json:"key_prefix"`
	Permissions []string `json:"permissions"`
	LastUsedAt  *string  `json:"last_used_at"`
	ExpiresAt   *string  `json:"expires_at"`
	CreatedAt   string   `json:"created_at"`
	CreatedBy   *string  `json:"created_by"`
}

// apiKeyCreateRequest is the JSON body for creating an API key.
type apiKeyCreateRequest struct {
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
	ExpiresIn   *int     `json:"expires_in"` // days until expiration, nil = no expiry
}

// apiKeyCreateResponse includes the raw key (shown only once).
type apiKeyCreateResponse struct {
	apiKeyResponse
	Key string `json:"key"`
}

// handleListAPIKeys returns all API keys for the current org.
func (s *Server) handleListAPIKeys(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, name, key_prefix, permissions, last_used_at, expires_at, created_at, created_by
		 FROM api_keys
		 WHERE org_id = $1
		 ORDER BY created_at DESC`,
		orgID,
	)
	if err != nil {
		s.logger.Error("failed to list API keys", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to list API keys")
		return
	}
	defer rows.Close()

	keys := []apiKeyResponse{}
	for rows.Next() {
		var k apiKeyResponse
		var lastUsed, expires *time.Time
		var createdAt time.Time
		var createdBy *string
		var perms []string

		err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, pq.Array(&perms), &lastUsed, &expires, &createdAt, &createdBy)
		if err != nil {
			s.logger.Error("failed to scan API key", "error", err)
			continue
		}

		k.Permissions = perms
		if k.Permissions == nil {
			k.Permissions = []string{}
		}
		k.CreatedAt = createdAt.Format(time.RFC3339)
		k.CreatedBy = createdBy
		if lastUsed != nil {
			t := lastUsed.Format(time.RFC3339)
			k.LastUsedAt = &t
		}
		if expires != nil {
			t := expires.Format(time.RFC3339)
			k.ExpiresAt = &t
		}
		keys = append(keys, k)
	}

	WriteJSON(w, http.StatusOK, keys)
}

// handleCreateAPIKey creates a new API key for the current org.
func (s *Server) handleCreateAPIKey(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	userID := middleware.GetUserID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req apiKeyCreateRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "INVALID_NAME", "API key name is required")
		return
	}

	// Generate the key
	rawKey, err := auth.GenerateAPIKey()
	if err != nil {
		s.logger.Error("failed to generate API key", "error", err)
		WriteError(w, http.StatusInternalServerError, "GENERATE_ERROR", "failed to generate API key")
		return
	}

	keyHash := auth.HashAPIKey(rawKey)
	keyPrefix := auth.KeyPrefix(rawKey)

	// Default permissions
	perms := req.Permissions
	if len(perms) == 0 {
		perms = []string{"read", "write"}
	}

	// Compute expiration
	var expiresAt *time.Time
	if req.ExpiresIn != nil && *req.ExpiresIn > 0 {
		t := time.Now().Add(time.Duration(*req.ExpiresIn) * 24 * time.Hour)
		expiresAt = &t
	}

	// Determine created_by (might be nil if auth was via API key)
	var createdBy *string
	if userID != "" {
		createdBy = &userID
	}

	var keyID string
	var createdAt time.Time
	err = s.db.QueryRowContext(r.Context(),
		`INSERT INTO api_keys (org_id, name, key_hash, key_prefix, permissions, expires_at, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, created_at`,
		orgID, name, keyHash, keyPrefix, pq.Array(perms), expiresAt, createdBy,
	).Scan(&keyID, &createdAt)
	if err != nil {
		s.logger.Error("failed to insert API key", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to create API key")
		return
	}

	resp := apiKeyCreateResponse{
		apiKeyResponse: apiKeyResponse{
			ID:          keyID,
			Name:        name,
			KeyPrefix:   keyPrefix,
			Permissions: perms,
			CreatedAt:   createdAt.Format(time.RFC3339),
			CreatedBy:   createdBy,
		},
		Key: rawKey,
	}
	if expiresAt != nil {
		t := expiresAt.Format(time.RFC3339)
		resp.ExpiresAt = &t
	}

	WriteJSON(w, http.StatusCreated, resp)
}

// handleDeleteAPIKey revokes (deletes) an API key.
func (s *Server) handleDeleteAPIKey(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	keyID := chi.URLParam(r, "id")
	if keyID == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_ID", "API key ID is required")
		return
	}

	result, err := s.db.ExecContext(r.Context(),
		`DELETE FROM api_keys WHERE id = $1 AND org_id = $2`,
		keyID, orgID,
	)
	if err != nil {
		s.logger.Error("failed to delete API key", "error", err, "key_id", keyID, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete API key")
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "API key not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
