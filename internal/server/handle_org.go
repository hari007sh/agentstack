package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/agentstack/agentstack/internal/server/middleware"
)

// orgResponse is the JSON response for organization data.
type orgResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	Plan      string `json:"plan"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// orgUpdateRequest is the JSON body for updating an organization.
type orgUpdateRequest struct {
	Name *string `json:"name"`
	Slug *string `json:"slug"`
}

// handleGetOrg returns the current user's organization.
func (s *Server) handleGetOrg(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var org orgResponse
	err := s.db.QueryRowContext(r.Context(),
		`SELECT id, name, slug, plan, created_at, updated_at FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.Plan, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		s.logger.Error("failed to fetch organization", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to fetch organization")
		return
	}

	WriteJSON(w, http.StatusOK, org)
}

// handleUpdateOrg updates the current user's organization name and/or slug.
func (s *Server) handleUpdateOrg(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req orgUpdateRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	if req.Name == nil && req.Slug == nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "at least one of name or slug must be provided")
		return
	}

	// Validate slug format if provided
	if req.Slug != nil {
		slug := strings.TrimSpace(*req.Slug)
		if slug == "" {
			WriteError(w, http.StatusBadRequest, "INVALID_SLUG", "slug cannot be empty")
			return
		}
		for _, c := range slug {
			if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-') {
				WriteError(w, http.StatusBadRequest, "INVALID_SLUG", "slug must contain only lowercase letters, numbers, and hyphens")
				return
			}
		}
	}

	// Validate name if provided
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			WriteError(w, http.StatusBadRequest, "INVALID_NAME", "name cannot be empty")
			return
		}
	}

	// Build dynamic update query
	setClauses := []string{"updated_at = NOW()"}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, "name = $"+itoa(argIdx))
		args = append(args, strings.TrimSpace(*req.Name))
		argIdx++
	}
	if req.Slug != nil {
		setClauses = append(setClauses, "slug = $"+itoa(argIdx))
		args = append(args, strings.TrimSpace(*req.Slug))
		argIdx++
	}

	args = append(args, orgID)
	query := "UPDATE organizations SET " + strings.Join(setClauses, ", ") + " WHERE id = $" + itoa(argIdx)

	result, err := s.db.ExecContext(r.Context(), query, args...)
	if err != nil {
		// Check for slug uniqueness conflict
		if strings.Contains(err.Error(), "idx_organizations_slug") || strings.Contains(err.Error(), "unique") {
			WriteError(w, http.StatusConflict, "SLUG_CONFLICT", "slug is already taken")
			return
		}
		s.logger.Error("failed to update organization", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to update organization")
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "organization not found")
		return
	}

	// Fetch updated org
	var org orgResponse
	err = s.db.QueryRowContext(r.Context(),
		`SELECT id, name, slug, plan, created_at, updated_at FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&org.ID, &org.Name, &org.Slug, &org.Plan, &org.CreatedAt, &org.UpdatedAt)
	if err != nil {
		s.logger.Error("failed to fetch updated organization", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to fetch updated organization")
		return
	}

	WriteJSON(w, http.StatusOK, org)
}

// handleDeleteOrg deletes the current user's organization and all associated data.
func (s *Server) handleDeleteOrg(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	userID := middleware.GetUserID(r.Context())
	if orgID == "" || userID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization or user context")
		return
	}

	// Verify the user is an owner
	var role string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT role FROM users WHERE id = $1 AND org_id = $2`,
		userID, orgID,
	).Scan(&role)
	if err != nil || role != "owner" {
		WriteError(w, http.StatusForbidden, "FORBIDDEN", "only organization owners can delete the organization")
		return
	}

	// Begin transaction — delete users first (they reference org), then org (cascades api_keys)
	tx, err := s.db.BeginTx(r.Context(), nil)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to start transaction")
		return
	}
	defer tx.Rollback()

	// Delete users in this org
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM users WHERE org_id = $1`, orgID); err != nil {
		s.logger.Error("failed to delete org users", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete organization")
		return
	}

	// Delete organization (api_keys cascade)
	if _, err := tx.ExecContext(r.Context(), `DELETE FROM organizations WHERE id = $1`, orgID); err != nil {
		s.logger.Error("failed to delete organization", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to delete organization")
		return
	}

	if err := tx.Commit(); err != nil {
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to commit deletion")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleGetOrgUsage returns usage stats for the current user's organization.
func (s *Server) handleGetOrgUsage(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	// Get member count
	var memberCount int
	err := s.db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM users WHERE org_id = $1`, orgID,
	).Scan(&memberCount)
	if err != nil {
		memberCount = 0
	}

	// Get API key count
	var keyCount int
	err = s.db.QueryRowContext(r.Context(),
		`SELECT COUNT(*) FROM api_keys WHERE org_id = $1`, orgID,
	).Scan(&keyCount)
	if err != nil {
		keyCount = 0
	}

	// Get plan limits
	var plan string
	var createdAt time.Time
	err = s.db.QueryRowContext(r.Context(),
		`SELECT plan, created_at FROM organizations WHERE id = $1`, orgID,
	).Scan(&plan, &createdAt)
	if err != nil {
		plan = "free"
		createdAt = time.Now()
	}

	planLimits := map[string]int{
		"free":       100000,
		"cloud":      100000,
		"team":       1000000,
		"enterprise": 10000000,
	}

	limit, ok := planLimits[plan]
	if !ok {
		limit = 100000
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"member_count": memberCount,
		"key_count":    keyCount,
		"plan":         plan,
		"events_limit": limit,
		"created_at":   createdAt.Format(time.RFC3339),
	})
}

// itoa converts an int to string without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
