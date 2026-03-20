package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/agentstack/agentstack/internal/prompt/store"
)

// VersionService handles prompt version business logic.
type VersionService struct {
	store  *store.PostgresStore
	logger *slog.Logger
}

// NewVersionService creates a new VersionService.
func NewVersionService(store *store.PostgresStore, logger *slog.Logger) *VersionService {
	return &VersionService{store: store, logger: logger}
}

// CreateVersionInput holds the input for creating a new version.
type CreateVersionInput struct {
	Body         string          `json:"body"`
	Model        string          `json:"model"`
	SystemPrompt string          `json:"system_prompt"`
	Variables    json.RawMessage `json:"variables"`
	Config       json.RawMessage `json:"config"`
	ChangeNote   string          `json:"change_note"`
}

// CreateVersion creates a new version with an auto-incremented version number.
func (s *VersionService) CreateVersion(ctx context.Context, orgID, promptID, createdBy string, input CreateVersionInput) (*store.PromptVersion, error) {
	// Verify the prompt exists
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return nil, fmt.Errorf("prompt not found")
	}

	// Validate body
	if input.Body == "" {
		return nil, fmt.Errorf("body is required")
	}

	// Get the next version number
	latestVersion, err := s.store.GetLatestVersionNumber(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get latest version: %w", err)
	}
	nextVersion := latestVersion + 1

	version := &store.PromptVersion{
		PromptID:     promptID,
		OrgID:        orgID,
		Version:      nextVersion,
		Body:         input.Body,
		Model:        input.Model,
		Variables:    input.Variables,
		SystemPrompt: input.SystemPrompt,
		Config:       input.Config,
		ChangeNote:   input.ChangeNote,
		CreatedBy:    createdBy,
	}

	id, err := s.store.CreateVersion(ctx, version)
	if err != nil {
		return nil, fmt.Errorf("create version: %w", err)
	}

	// Fetch the created version
	created, err := s.store.GetVersionByID(ctx, orgID, id)
	if err != nil {
		return nil, fmt.Errorf("fetch created version: %w", err)
	}

	s.logger.Info("version created",
		"org_id", orgID,
		"prompt_id", promptID,
		"version", nextVersion,
	)
	return created, nil
}

// ListVersions returns all versions of a prompt.
func (s *VersionService) ListVersions(ctx context.Context, orgID, promptID string) ([]store.PromptVersion, error) {
	// Verify the prompt exists
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return nil, fmt.Errorf("prompt not found")
	}

	return s.store.ListVersions(ctx, orgID, promptID)
}

// GetVersion returns a specific version of a prompt.
func (s *VersionService) GetVersion(ctx context.Context, orgID, promptID string, version int) (*store.PromptVersion, error) {
	// Verify the prompt exists
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return nil, fmt.Errorf("prompt not found")
	}

	v, err := s.store.GetVersion(ctx, orgID, promptID, version)
	if err != nil {
		return nil, fmt.Errorf("get version: %w", err)
	}
	return v, nil
}

// Deploy sets a specific version as the active version of a prompt.
func (s *VersionService) Deploy(ctx context.Context, orgID, promptID string, version int) error {
	// Verify the prompt exists
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return fmt.Errorf("prompt not found")
	}

	// Verify the version exists
	v, err := s.store.GetVersion(ctx, orgID, promptID, version)
	if err != nil {
		return fmt.Errorf("get version: %w", err)
	}
	if v == nil {
		return fmt.Errorf("version not found")
	}

	// Update active version
	if err := s.store.SetActiveVersion(ctx, orgID, promptID, version); err != nil {
		return fmt.Errorf("set active version: %w", err)
	}

	s.logger.Info("version deployed",
		"org_id", orgID,
		"prompt_id", promptID,
		"version", version,
	)
	return nil
}

// Rollback deploys the version immediately before the current active version.
func (s *VersionService) Rollback(ctx context.Context, orgID, promptID string) (*store.Prompt, error) {
	// Verify the prompt exists
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return nil, fmt.Errorf("prompt not found")
	}

	if prompt.ActiveVersion <= 1 {
		return nil, fmt.Errorf("cannot rollback: already at version 1")
	}

	previousVersion := prompt.ActiveVersion - 1

	// Verify previous version exists
	v, err := s.store.GetVersion(ctx, orgID, promptID, previousVersion)
	if err != nil {
		return nil, fmt.Errorf("get previous version: %w", err)
	}
	if v == nil {
		return nil, fmt.Errorf("previous version %d not found", previousVersion)
	}

	// Deploy previous version
	if err := s.store.SetActiveVersion(ctx, orgID, promptID, previousVersion); err != nil {
		return nil, fmt.Errorf("set active version: %w", err)
	}

	// Fetch updated prompt
	updated, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("fetch updated prompt: %w", err)
	}

	s.logger.Info("version rolled back",
		"org_id", orgID,
		"prompt_id", promptID,
		"from_version", prompt.ActiveVersion,
		"to_version", previousVersion,
	)
	return updated, nil
}
