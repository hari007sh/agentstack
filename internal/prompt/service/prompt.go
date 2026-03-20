// Package service provides business logic for the Prompt module.
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/agentstack/agentstack/internal/prompt/store"
)

// slugRegex validates slug format: lowercase letters, numbers, hyphens only.
var slugRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9\-]*[a-z0-9]$`)

// PromptService handles prompt CRUD business logic.
type PromptService struct {
	store  *store.PostgresStore
	logger *slog.Logger
}

// NewPromptService creates a new PromptService.
func NewPromptService(store *store.PostgresStore, logger *slog.Logger) *PromptService {
	return &PromptService{store: store, logger: logger}
}

// CreatePromptInput holds the input for creating a new prompt.
type CreatePromptInput struct {
	Slug         string          `json:"slug"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Body         string          `json:"body"`
	Model        string          `json:"model"`
	SystemPrompt string          `json:"system_prompt"`
	Variables    json.RawMessage `json:"variables"`
	Config       json.RawMessage `json:"config"`
	Tags         []string        `json:"tags"`
	Metadata     json.RawMessage `json:"metadata"`
}

// UpdatePromptInput holds the input for updating a prompt's metadata.
type UpdatePromptInput struct {
	Name        *string          `json:"name"`
	Description *string          `json:"description"`
	Tags        []string         `json:"tags"`
	Metadata    json.RawMessage  `json:"metadata"`
}

// PromptWithVersion is a prompt enriched with its active version body.
type PromptWithVersion struct {
	store.Prompt
	ActiveBody         string          `json:"active_body,omitempty"`
	ActiveSystemPrompt string          `json:"active_system_prompt,omitempty"`
	ActiveModel        string          `json:"active_model,omitempty"`
	ActiveVariables    json.RawMessage `json:"active_variables,omitempty"`
	ActiveConfig       json.RawMessage `json:"active_config,omitempty"`
}

// CreatePrompt creates a new prompt with an initial version 1.
func (s *PromptService) CreatePrompt(ctx context.Context, orgID string, input CreatePromptInput) (*PromptWithVersion, error) {
	// Validate slug
	if input.Slug == "" {
		return nil, fmt.Errorf("slug is required")
	}
	if len(input.Slug) < 2 {
		return nil, fmt.Errorf("slug must be at least 2 characters")
	}
	if len(input.Slug) > 128 {
		return nil, fmt.Errorf("slug must be at most 128 characters")
	}
	if !slugRegex.MatchString(input.Slug) {
		return nil, fmt.Errorf("slug must contain only lowercase letters, numbers, and hyphens")
	}

	// Validate name
	if input.Name == "" {
		return nil, fmt.Errorf("name is required")
	}

	// Validate body
	if input.Body == "" {
		return nil, fmt.Errorf("body is required")
	}

	// Check slug uniqueness within org
	existing, err := s.store.GetPromptBySlug(ctx, orgID, input.Slug)
	if err != nil {
		return nil, fmt.Errorf("check slug uniqueness: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("slug already exists")
	}

	tags := input.Tags
	if tags == nil {
		tags = []string{}
	}

	// Create prompt
	prompt := &store.Prompt{
		OrgID:         orgID,
		Slug:          input.Slug,
		Name:          input.Name,
		Description:   input.Description,
		ActiveVersion: 1,
		Tags:          tags,
		Metadata:      input.Metadata,
	}

	promptID, err := s.store.CreatePrompt(ctx, prompt)
	if err != nil {
		return nil, fmt.Errorf("create prompt: %w", err)
	}

	// Create version 1
	version := &store.PromptVersion{
		PromptID:     promptID,
		OrgID:        orgID,
		Version:      1,
		Body:         input.Body,
		Model:        input.Model,
		Variables:    input.Variables,
		SystemPrompt: input.SystemPrompt,
		Config:       input.Config,
		ChangeNote:   "Initial version",
		CreatedBy:    "", // set by handler
	}

	_, err = s.store.CreateVersion(ctx, version)
	if err != nil {
		return nil, fmt.Errorf("create initial version: %w", err)
	}

	// Fetch the created prompt
	created, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("fetch created prompt: %w", err)
	}

	result := &PromptWithVersion{
		Prompt:             *created,
		ActiveBody:         input.Body,
		ActiveSystemPrompt: input.SystemPrompt,
		ActiveModel:        input.Model,
		ActiveVariables:    input.Variables,
		ActiveConfig:       input.Config,
	}

	s.logger.Info("prompt created", "org_id", orgID, "prompt_id", promptID, "slug", input.Slug)
	return result, nil
}

// GetPrompt returns a prompt with its active version content.
func (s *PromptService) GetPrompt(ctx context.Context, orgID, promptID string) (*PromptWithVersion, error) {
	prompt, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if prompt == nil {
		return nil, nil
	}

	return s.enrichPromptWithVersion(ctx, prompt)
}

// GetPromptBySlug returns a prompt by slug with its active version content.
func (s *PromptService) GetPromptBySlug(ctx context.Context, orgID, slug string) (*PromptWithVersion, error) {
	prompt, err := s.store.GetPromptBySlug(ctx, orgID, slug)
	if err != nil {
		return nil, fmt.Errorf("get prompt by slug: %w", err)
	}
	if prompt == nil {
		return nil, nil
	}

	return s.enrichPromptWithVersion(ctx, prompt)
}

// ListPrompts returns paginated prompts for an organization.
func (s *PromptService) ListPrompts(ctx context.Context, orgID string, filter store.PromptFilter) ([]store.Prompt, int, error) {
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	return s.store.ListPrompts(ctx, orgID, filter)
}

// UpdatePrompt updates a prompt's metadata.
func (s *PromptService) UpdatePrompt(ctx context.Context, orgID, promptID string, input UpdatePromptInput) (*store.Prompt, error) {
	existing, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("get prompt: %w", err)
	}
	if existing == nil {
		return nil, nil
	}

	if input.Name != nil {
		if strings.TrimSpace(*input.Name) == "" {
			return nil, fmt.Errorf("name cannot be empty")
		}
		existing.Name = *input.Name
	}
	if input.Description != nil {
		existing.Description = *input.Description
	}
	if input.Tags != nil {
		existing.Tags = input.Tags
	}
	if input.Metadata != nil {
		existing.Metadata = input.Metadata
	}

	if err := s.store.UpdatePrompt(ctx, orgID, existing); err != nil {
		return nil, fmt.Errorf("update prompt: %w", err)
	}

	updated, err := s.store.GetPrompt(ctx, orgID, promptID)
	if err != nil {
		return nil, fmt.Errorf("fetch updated prompt: %w", err)
	}

	s.logger.Info("prompt updated", "org_id", orgID, "prompt_id", promptID)
	return updated, nil
}

// DeletePrompt deletes a prompt and all its versions.
func (s *PromptService) DeletePrompt(ctx context.Context, orgID, promptID string) error {
	if err := s.store.DeletePrompt(ctx, orgID, promptID); err != nil {
		return fmt.Errorf("delete prompt: %w", err)
	}
	s.logger.Info("prompt deleted", "org_id", orgID, "prompt_id", promptID)
	return nil
}

// enrichPromptWithVersion loads the active version and attaches its content to the prompt.
func (s *PromptService) enrichPromptWithVersion(ctx context.Context, prompt *store.Prompt) (*PromptWithVersion, error) {
	version, err := s.store.GetVersion(ctx, prompt.OrgID, prompt.ID, prompt.ActiveVersion)
	if err != nil {
		return nil, fmt.Errorf("get active version: %w", err)
	}

	result := &PromptWithVersion{Prompt: *prompt}
	if version != nil {
		result.ActiveBody = version.Body
		result.ActiveSystemPrompt = version.SystemPrompt
		result.ActiveModel = version.Model
		result.ActiveVariables = version.Variables
		result.ActiveConfig = version.Config
	}

	return result, nil
}
