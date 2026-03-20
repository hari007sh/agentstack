package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"

	"github.com/agentstack/agentstack/internal/trace/store"
)

// PatternService manages failure patterns in PostgreSQL.
type PatternService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewPatternService creates a new pattern service.
func NewPatternService(pg *store.PostgresStore, logger *slog.Logger) *PatternService {
	return &PatternService{pg: pg, logger: logger}
}

// ListPatterns returns all failure patterns for an organization.
func (s *PatternService) ListPatterns(ctx context.Context, orgID string) ([]store.FailurePattern, error) {
	patterns, err := s.pg.ListPatterns(ctx, orgID)
	if err != nil {
		s.logger.Error("failed to list patterns", "org_id", orgID, "error", err)
		return nil, err
	}
	return patterns, nil
}

// GetPattern returns a single failure pattern.
func (s *PatternService) GetPattern(ctx context.Context, orgID, id string) (*store.FailurePattern, error) {
	p, err := s.pg.GetPattern(ctx, orgID, id)
	if err != nil {
		s.logger.Error("failed to get pattern", "id", id, "error", err)
		return nil, err
	}
	return p, nil
}

// CreatePatternRequest contains the data for creating a failure pattern.
type CreatePatternRequest struct {
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Category       string          `json:"category"`
	DetectionRules json.RawMessage `json:"detection_rules"`
	Severity       string          `json:"severity"`
	IsBuiltin      bool            `json:"is_builtin"`
	Enabled        *bool           `json:"enabled"`
}

// CreatePattern creates a new failure pattern.
func (s *PatternService) CreatePattern(ctx context.Context, orgID string, req *CreatePatternRequest) (*store.FailurePattern, error) {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	if req.DetectionRules == nil {
		req.DetectionRules = json.RawMessage("{}")
	}

	p := &store.FailurePattern{
		OrgID:          orgID,
		Name:           req.Name,
		Description:    req.Description,
		Category:       req.Category,
		DetectionRules: req.DetectionRules,
		Severity:       req.Severity,
		IsBuiltin:      req.IsBuiltin,
		Enabled:        enabled,
	}

	if err := s.pg.CreatePattern(ctx, p); err != nil {
		s.logger.Error("failed to create pattern", "org_id", orgID, "error", err)
		return nil, err
	}

	s.logger.Info("created failure pattern", "id", p.ID, "name", p.Name, "org_id", orgID)
	return p, nil
}

// UpdatePatternRequest contains the data for updating a failure pattern.
type UpdatePatternRequest struct {
	Name           string          `json:"name"`
	Description    string          `json:"description"`
	Category       string          `json:"category"`
	DetectionRules json.RawMessage `json:"detection_rules"`
	Severity       string          `json:"severity"`
	Enabled        *bool           `json:"enabled"`
}

// UpdatePattern updates an existing failure pattern.
func (s *PatternService) UpdatePattern(ctx context.Context, orgID, id string, req *UpdatePatternRequest) (*store.FailurePattern, error) {
	existing, err := s.pg.GetPattern(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}

	// Apply updates
	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.Category != "" {
		existing.Category = req.Category
	}
	if req.DetectionRules != nil {
		existing.DetectionRules = req.DetectionRules
	}
	if req.Severity != "" {
		existing.Severity = req.Severity
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := s.pg.UpdatePattern(ctx, existing); err != nil {
		s.logger.Error("failed to update pattern", "id", id, "error", err)
		return nil, err
	}

	s.logger.Info("updated failure pattern", "id", id, "org_id", orgID)
	return existing, nil
}

// DeletePattern removes a failure pattern.
func (s *PatternService) DeletePattern(ctx context.Context, orgID, id string) error {
	if err := s.pg.DeletePattern(ctx, orgID, id); err != nil {
		if err == sql.ErrNoRows {
			return err
		}
		s.logger.Error("failed to delete pattern", "id", id, "error", err)
		return err
	}

	s.logger.Info("deleted failure pattern", "id", id, "org_id", orgID)
	return nil
}
