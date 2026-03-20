package model

import "time"

// User represents an authenticated user in the system.
type User struct {
	ID            string    `json:"id" db:"id"`
	Email         string    `json:"email" db:"email"`
	Name          string    `json:"name" db:"name"`
	AvatarURL     string    `json:"avatar_url" db:"avatar_url"`
	GitHubID      int64     `json:"github_id" db:"github_id"`
	OrgID         string    `json:"org_id" db:"org_id"`
	Role          string    `json:"role" db:"role"` // owner, admin, member
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}
