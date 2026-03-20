package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/agentstack/agentstack/internal/server/middleware"
	"github.com/go-chi/chi/v5"
)

// teamMemberResponse is the JSON response for a team member.
type teamMemberResponse struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Role      string `json:"role"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// teamInviteRequest is the JSON body for inviting a new team member.
type teamInviteRequest struct {
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// teamRoleUpdateRequest is the JSON body for updating a team member's role.
type teamRoleUpdateRequest struct {
	Role string `json:"role"`
}

// handleListTeam returns all users in the current org.
func (s *Server) handleListTeam(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	rows, err := s.db.QueryContext(r.Context(),
		`SELECT id, email, name, avatar_url, role, created_at, updated_at
		 FROM users
		 WHERE org_id = $1
		 ORDER BY created_at ASC`,
		orgID,
	)
	if err != nil {
		s.logger.Error("failed to list team members", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to list team members")
		return
	}
	defer rows.Close()

	members := []teamMemberResponse{}
	for rows.Next() {
		var m teamMemberResponse
		var createdAt, updatedAt time.Time
		err := rows.Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.Role, &createdAt, &updatedAt)
		if err != nil {
			s.logger.Error("failed to scan team member", "error", err)
			continue
		}
		m.CreatedAt = createdAt.Format(time.RFC3339)
		m.UpdatedAt = updatedAt.Format(time.RFC3339)
		members = append(members, m)
	}

	WriteJSON(w, http.StatusOK, members)
}

// handleInviteTeamMember creates a new user in the current org.
func (s *Server) handleInviteTeamMember(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	if orgID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization context")
		return
	}

	var req teamInviteRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	// Validate email
	email := strings.TrimSpace(req.Email)
	if email == "" || !strings.Contains(email, "@") {
		WriteError(w, http.StatusBadRequest, "INVALID_EMAIL", "a valid email address is required")
		return
	}

	// Validate name
	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "INVALID_NAME", "name is required")
		return
	}

	// Validate role
	role := strings.TrimSpace(req.Role)
	if role == "" {
		role = "member"
	}
	if role != "owner" && role != "admin" && role != "member" {
		WriteError(w, http.StatusBadRequest, "INVALID_ROLE", "role must be one of: owner, admin, member")
		return
	}

	// Check for duplicate email within the org
	var exists bool
	err := s.db.QueryRowContext(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND org_id = $2)`,
		email, orgID,
	).Scan(&exists)
	if err != nil {
		s.logger.Error("failed to check duplicate email", "error", err)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to check for existing member")
		return
	}
	if exists {
		WriteError(w, http.StatusConflict, "DUPLICATE_EMAIL", "a team member with this email already exists")
		return
	}

	// Insert new user
	var m teamMemberResponse
	var createdAt, updatedAt time.Time
	err = s.db.QueryRowContext(r.Context(),
		`INSERT INTO users (email, name, org_id, role)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, name, avatar_url, role, created_at, updated_at`,
		email, name, orgID, role,
	).Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.Role, &createdAt, &updatedAt)
	if err != nil {
		s.logger.Error("failed to invite team member", "error", err, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to invite team member")
		return
	}

	m.CreatedAt = createdAt.Format(time.RFC3339)
	m.UpdatedAt = updatedAt.Format(time.RFC3339)

	WriteJSON(w, http.StatusCreated, m)
}

// handleUpdateTeamMemberRole updates a team member's role.
func (s *Server) handleUpdateTeamMemberRole(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	userID := middleware.GetUserID(r.Context())
	if orgID == "" || userID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization or user context")
		return
	}

	memberID := chi.URLParam(r, "id")
	if memberID == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_ID", "team member ID is required")
		return
	}

	// Prevent changing your own role
	if memberID == userID {
		WriteError(w, http.StatusBadRequest, "SELF_ROLE_CHANGE", "you cannot change your own role")
		return
	}

	var req teamRoleUpdateRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "INVALID_BODY", "invalid request body")
		return
	}

	role := strings.TrimSpace(req.Role)
	if role != "owner" && role != "admin" && role != "member" {
		WriteError(w, http.StatusBadRequest, "INVALID_ROLE", "role must be one of: owner, admin, member")
		return
	}

	// Verify the target member belongs to the same org
	var currentRole string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT role FROM users WHERE id = $1 AND org_id = $2`,
		memberID, orgID,
	).Scan(&currentRole)
	if err != nil {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "team member not found")
		return
	}

	// Update the role
	result, err := s.db.ExecContext(r.Context(),
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
		role, memberID, orgID,
	)
	if err != nil {
		s.logger.Error("failed to update team member role", "error", err, "member_id", memberID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to update team member role")
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "team member not found")
		return
	}

	// Return updated member
	var m teamMemberResponse
	var createdAt, updatedAt time.Time
	err = s.db.QueryRowContext(r.Context(),
		`SELECT id, email, name, avatar_url, role, created_at, updated_at
		 FROM users WHERE id = $1 AND org_id = $2`,
		memberID, orgID,
	).Scan(&m.ID, &m.Email, &m.Name, &m.AvatarURL, &m.Role, &createdAt, &updatedAt)
	if err != nil {
		s.logger.Error("failed to fetch updated team member", "error", err)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to fetch updated team member")
		return
	}
	m.CreatedAt = createdAt.Format(time.RFC3339)
	m.UpdatedAt = updatedAt.Format(time.RFC3339)

	WriteJSON(w, http.StatusOK, m)
}

// handleRemoveTeamMember removes a team member from the org.
func (s *Server) handleRemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.GetOrgID(r.Context())
	userID := middleware.GetUserID(r.Context())
	if orgID == "" || userID == "" {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "missing organization or user context")
		return
	}

	memberID := chi.URLParam(r, "id")
	if memberID == "" {
		WriteError(w, http.StatusBadRequest, "MISSING_ID", "team member ID is required")
		return
	}

	// Prevent self-deletion
	if memberID == userID {
		WriteError(w, http.StatusBadRequest, "SELF_DELETE", "you cannot remove yourself from the team")
		return
	}

	// Check the target member exists and get their role
	var targetRole string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT role FROM users WHERE id = $1 AND org_id = $2`,
		memberID, orgID,
	).Scan(&targetRole)
	if err != nil {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "team member not found")
		return
	}

	// Prevent deleting the last owner
	if targetRole == "owner" {
		var ownerCount int
		err = s.db.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM users WHERE org_id = $1 AND role = 'owner'`,
			orgID,
		).Scan(&ownerCount)
		if err != nil {
			s.logger.Error("failed to count owners", "error", err, "org_id", orgID)
			WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to verify owner count")
			return
		}
		if ownerCount <= 1 {
			WriteError(w, http.StatusBadRequest, "LAST_OWNER", "cannot remove the last owner of the organization")
			return
		}
	}

	// Delete the member
	result, err := s.db.ExecContext(r.Context(),
		`DELETE FROM users WHERE id = $1 AND org_id = $2`,
		memberID, orgID,
	)
	if err != nil {
		s.logger.Error("failed to remove team member", "error", err, "member_id", memberID, "org_id", orgID)
		WriteError(w, http.StatusInternalServerError, "DB_ERROR", "failed to remove team member")
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		WriteError(w, http.StatusNotFound, "NOT_FOUND", "team member not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
