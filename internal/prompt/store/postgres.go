// Package store provides PostgreSQL CRUD operations for the Prompt module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// PostgresStore provides CRUD access to prompt data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Prompt module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// ========================
// Domain Structs
// ========================

// Prompt represents a prompt row.
type Prompt struct {
	ID            string          `json:"id"`
	OrgID         string          `json:"org_id"`
	Slug          string          `json:"slug"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	ActiveVersion int             `json:"active_version"`
	Tags          []string        `json:"tags"`
	Metadata      json.RawMessage `json:"metadata"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// PromptVersion represents a prompt_versions row.
type PromptVersion struct {
	ID           string          `json:"id"`
	PromptID     string          `json:"prompt_id"`
	OrgID        string          `json:"org_id"`
	Version      int             `json:"version"`
	Body         string          `json:"body"`
	Model        string          `json:"model"`
	Variables    json.RawMessage `json:"variables"`
	SystemPrompt string          `json:"system_prompt"`
	Config       json.RawMessage `json:"config"`
	ChangeNote   string          `json:"change_note"`
	CreatedBy    string          `json:"created_by"`
	CreatedAt    time.Time       `json:"created_at"`
}

// PromptFilter holds query parameters for listing prompts.
type PromptFilter struct {
	Search string
	Tag    string
	Limit  int
	Offset int
}

// ========================
// Prompt CRUD
// ========================

// CreatePrompt inserts a new prompt and returns its ID.
func (s *PostgresStore) CreatePrompt(ctx context.Context, p *Prompt) (string, error) {
	metadata := p.Metadata
	if metadata == nil {
		metadata = json.RawMessage("{}")
	}

	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO prompts (org_id, slug, name, description, active_version, tags, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		p.OrgID, p.Slug, p.Name, p.Description, p.ActiveVersion, sliceToPGArray(p.Tags), metadata,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create prompt: %w", err)
	}
	return id, nil
}

// GetPrompt returns a prompt by ID scoped to an organization.
func (s *PostgresStore) GetPrompt(ctx context.Context, orgID, id string) (*Prompt, error) {
	var p Prompt
	var tags string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, slug, name, description, active_version, tags, metadata, created_at, updated_at
		 FROM prompts WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&p.ID, &p.OrgID, &p.Slug, &p.Name, &p.Description, &p.ActiveVersion, &tags, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	p.Tags = pgArrayToSlice(tags)
	return &p, nil
}

// GetPromptBySlug returns a prompt by slug scoped to an organization.
func (s *PostgresStore) GetPromptBySlug(ctx context.Context, orgID, slug string) (*Prompt, error) {
	var p Prompt
	var tags string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, org_id, slug, name, description, active_version, tags, metadata, created_at, updated_at
		 FROM prompts WHERE slug = $1 AND org_id = $2`, slug, orgID,
	).Scan(&p.ID, &p.OrgID, &p.Slug, &p.Name, &p.Description, &p.ActiveVersion, &tags, &p.Metadata, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get prompt by slug: %w", err)
	}
	p.Tags = pgArrayToSlice(tags)
	return &p, nil
}

// ListPrompts returns prompts for an organization with optional filtering.
func (s *PostgresStore) ListPrompts(ctx context.Context, orgID string, filter PromptFilter) ([]Prompt, int, error) {
	// Build the count query
	countQuery := `SELECT COUNT(*) FROM prompts WHERE org_id = $1`
	args := []interface{}{orgID}
	argIdx := 2

	if filter.Search != "" {
		countQuery += fmt.Sprintf(` AND (name ILIKE $%d OR slug ILIKE $%d)`, argIdx, argIdx)
		args = append(args, "%"+filter.Search+"%")
		argIdx++
	}
	if filter.Tag != "" {
		countQuery += fmt.Sprintf(` AND $%d = ANY(tags)`, argIdx)
		args = append(args, filter.Tag)
		argIdx++
	}

	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count prompts: %w", err)
	}

	// Build the list query
	listQuery := `SELECT id, org_id, slug, name, description, active_version, tags, metadata, created_at, updated_at
		FROM prompts WHERE org_id = $1`
	listArgs := []interface{}{orgID}
	listArgIdx := 2

	if filter.Search != "" {
		listQuery += fmt.Sprintf(` AND (name ILIKE $%d OR slug ILIKE $%d)`, listArgIdx, listArgIdx)
		listArgs = append(listArgs, "%"+filter.Search+"%")
		listArgIdx++
	}
	if filter.Tag != "" {
		listQuery += fmt.Sprintf(` AND $%d = ANY(tags)`, listArgIdx)
		listArgs = append(listArgs, filter.Tag)
		listArgIdx++
	}

	listQuery += ` ORDER BY updated_at DESC`
	listQuery += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, listArgIdx, listArgIdx+1)
	listArgs = append(listArgs, filter.Limit, filter.Offset)

	rows, err := s.db.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("list prompts: %w", err)
	}
	defer rows.Close()

	var prompts []Prompt
	for rows.Next() {
		var p Prompt
		var tags string
		if err := rows.Scan(&p.ID, &p.OrgID, &p.Slug, &p.Name, &p.Description, &p.ActiveVersion, &tags, &p.Metadata, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan prompt: %w", err)
		}
		p.Tags = pgArrayToSlice(tags)
		prompts = append(prompts, p)
	}
	if prompts == nil {
		prompts = []Prompt{}
	}
	return prompts, total, rows.Err()
}

// UpdatePrompt updates a prompt's metadata fields.
func (s *PostgresStore) UpdatePrompt(ctx context.Context, orgID string, p *Prompt) error {
	metadata := p.Metadata
	if metadata == nil {
		metadata = json.RawMessage("{}")
	}

	_, err := s.db.ExecContext(ctx,
		`UPDATE prompts SET name=$1, description=$2, tags=$3, metadata=$4, updated_at=NOW()
		 WHERE id=$5 AND org_id=$6`,
		p.Name, p.Description, sliceToPGArray(p.Tags), metadata, p.ID, orgID,
	)
	if err != nil {
		return fmt.Errorf("update prompt: %w", err)
	}
	return nil
}

// SetActiveVersion updates the active_version column of a prompt.
func (s *PostgresStore) SetActiveVersion(ctx context.Context, orgID, promptID string, version int) error {
	result, err := s.db.ExecContext(ctx,
		`UPDATE prompts SET active_version=$1, updated_at=NOW() WHERE id=$2 AND org_id=$3`,
		version, promptID, orgID,
	)
	if err != nil {
		return fmt.Errorf("set active version: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("prompt not found")
	}
	return nil
}

// DeletePrompt deletes a prompt and all its versions (cascade).
func (s *PostgresStore) DeletePrompt(ctx context.Context, orgID, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM prompts WHERE id=$1 AND org_id=$2`, id, orgID)
	if err != nil {
		return fmt.Errorf("delete prompt: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("prompt not found")
	}
	return nil
}

// ========================
// PromptVersion CRUD
// ========================

// CreateVersion inserts a new prompt version.
func (s *PostgresStore) CreateVersion(ctx context.Context, v *PromptVersion) (string, error) {
	variables := v.Variables
	if variables == nil {
		variables = json.RawMessage("{}")
	}
	config := v.Config
	if config == nil {
		config = json.RawMessage("{}")
	}

	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO prompt_versions (prompt_id, org_id, version, body, model, variables, system_prompt, config, change_note, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id`,
		v.PromptID, v.OrgID, v.Version, v.Body, v.Model, variables, v.SystemPrompt, config, v.ChangeNote, v.CreatedBy,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create version: %w", err)
	}
	return id, nil
}

// GetVersion returns a specific version of a prompt.
func (s *PostgresStore) GetVersion(ctx context.Context, orgID, promptID string, version int) (*PromptVersion, error) {
	var v PromptVersion
	err := s.db.QueryRowContext(ctx,
		`SELECT id, prompt_id, org_id, version, body, model, variables, system_prompt, config, change_note, created_by, created_at
		 FROM prompt_versions WHERE prompt_id = $1 AND org_id = $2 AND version = $3`,
		promptID, orgID, version,
	).Scan(&v.ID, &v.PromptID, &v.OrgID, &v.Version, &v.Body, &v.Model, &v.Variables, &v.SystemPrompt, &v.Config, &v.ChangeNote, &v.CreatedBy, &v.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get version: %w", err)
	}
	return &v, nil
}

// GetVersionByID returns a version by its own UUID.
func (s *PostgresStore) GetVersionByID(ctx context.Context, orgID, id string) (*PromptVersion, error) {
	var v PromptVersion
	err := s.db.QueryRowContext(ctx,
		`SELECT id, prompt_id, org_id, version, body, model, variables, system_prompt, config, change_note, created_by, created_at
		 FROM prompt_versions WHERE id = $1 AND org_id = $2`, id, orgID,
	).Scan(&v.ID, &v.PromptID, &v.OrgID, &v.Version, &v.Body, &v.Model, &v.Variables, &v.SystemPrompt, &v.Config, &v.ChangeNote, &v.CreatedBy, &v.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get version by id: %w", err)
	}
	return &v, nil
}

// ListVersions returns all versions of a prompt, ordered by version descending.
func (s *PostgresStore) ListVersions(ctx context.Context, orgID, promptID string) ([]PromptVersion, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, prompt_id, org_id, version, body, model, variables, system_prompt, config, change_note, created_by, created_at
		 FROM prompt_versions WHERE prompt_id = $1 AND org_id = $2
		 ORDER BY version DESC`,
		promptID, orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	defer rows.Close()

	var versions []PromptVersion
	for rows.Next() {
		var v PromptVersion
		if err := rows.Scan(&v.ID, &v.PromptID, &v.OrgID, &v.Version, &v.Body, &v.Model, &v.Variables, &v.SystemPrompt, &v.Config, &v.ChangeNote, &v.CreatedBy, &v.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan version: %w", err)
		}
		versions = append(versions, v)
	}
	if versions == nil {
		versions = []PromptVersion{}
	}
	return versions, rows.Err()
}

// GetLatestVersionNumber returns the highest version number for a prompt.
func (s *PostgresStore) GetLatestVersionNumber(ctx context.Context, orgID, promptID string) (int, error) {
	var maxVersion int
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(version), 0) FROM prompt_versions WHERE prompt_id = $1 AND org_id = $2`,
		promptID, orgID,
	).Scan(&maxVersion)
	if err != nil {
		return 0, fmt.Errorf("get latest version number: %w", err)
	}
	return maxVersion, nil
}

// ========================
// Helpers
// ========================

// pgArrayToSlice converts a PostgreSQL text array literal to a Go string slice.
func pgArrayToSlice(s string) []string {
	if s == "" || s == "{}" {
		return []string{}
	}
	s = s[1 : len(s)-1]
	if s == "" {
		return []string{}
	}
	return splitPGArray(s)
}

// splitPGArray splits a PostgreSQL array interior string on commas,
// respecting double-quoted elements.
func splitPGArray(s string) []string {
	var result []string
	var current []byte
	inQuotes := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch == '"' {
			inQuotes = !inQuotes
			continue
		}
		if ch == ',' && !inQuotes {
			result = append(result, string(current))
			current = current[:0]
			continue
		}
		current = append(current, ch)
	}
	result = append(result, string(current))
	return result
}

// sliceToPGArray converts a Go string slice to a PostgreSQL array literal.
func sliceToPGArray(ss []string) string {
	if len(ss) == 0 {
		return "{}"
	}
	elems := make([]string, len(ss))
	for i, s := range ss {
		elems[i] = `"` + s + `"`
	}
	return "{" + joinStrings(elems, ",") + "}"
}

func joinStrings(ss []string, sep string) string {
	if len(ss) == 0 {
		return ""
	}
	result := ss[0]
	for _, s := range ss[1:] {
		result += sep + s
	}
	return result
}
