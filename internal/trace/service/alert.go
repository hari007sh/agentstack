package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"

	"github.com/agentstack/agentstack/internal/trace/store"
)

// AlertService manages alert rules in PostgreSQL.
type AlertService struct {
	pg     *store.PostgresStore
	logger *slog.Logger
}

// NewAlertService creates a new alert service.
func NewAlertService(pg *store.PostgresStore, logger *slog.Logger) *AlertService {
	return &AlertService{pg: pg, logger: logger}
}

// ListAlertRules returns all alert rules for an organization.
func (s *AlertService) ListAlertRules(ctx context.Context, orgID string) ([]store.AlertRule, error) {
	rules, err := s.pg.ListAlertRules(ctx, orgID)
	if err != nil {
		s.logger.Error("failed to list alert rules", "org_id", orgID, "error", err)
		return nil, err
	}
	return rules, nil
}

// GetAlertRule returns a single alert rule.
func (s *AlertService) GetAlertRule(ctx context.Context, orgID, id string) (*store.AlertRule, error) {
	r, err := s.pg.GetAlertRule(ctx, orgID, id)
	if err != nil {
		s.logger.Error("failed to get alert rule", "id", id, "error", err)
		return nil, err
	}
	return r, nil
}

// CreateAlertRuleRequest contains the data for creating an alert rule.
type CreateAlertRuleRequest struct {
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	ConditionType   string          `json:"condition_type"`
	ConditionConfig json.RawMessage `json:"condition_config"`
	Channels        []string        `json:"channels"`
	ChannelConfig   json.RawMessage `json:"channel_config"`
	Enabled         *bool           `json:"enabled"`
}

// CreateAlertRule creates a new alert rule.
func (s *AlertService) CreateAlertRule(ctx context.Context, orgID string, req *CreateAlertRuleRequest) (*store.AlertRule, error) {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	if req.ConditionConfig == nil {
		req.ConditionConfig = json.RawMessage("{}")
	}
	if req.ChannelConfig == nil {
		req.ChannelConfig = json.RawMessage("{}")
	}
	if req.Channels == nil {
		req.Channels = []string{}
	}

	r := &store.AlertRule{
		OrgID:           orgID,
		Name:            req.Name,
		Description:     req.Description,
		ConditionType:   req.ConditionType,
		ConditionConfig: req.ConditionConfig,
		Channels:        req.Channels,
		ChannelConfig:   req.ChannelConfig,
		Enabled:         enabled,
	}

	if err := s.pg.CreateAlertRule(ctx, r); err != nil {
		s.logger.Error("failed to create alert rule", "org_id", orgID, "error", err)
		return nil, err
	}

	s.logger.Info("created alert rule", "id", r.ID, "name", r.Name, "org_id", orgID)
	return r, nil
}

// UpdateAlertRuleRequest contains the data for updating an alert rule.
type UpdateAlertRuleRequest struct {
	Name            string          `json:"name"`
	Description     string          `json:"description"`
	ConditionType   string          `json:"condition_type"`
	ConditionConfig json.RawMessage `json:"condition_config"`
	Channels        []string        `json:"channels"`
	ChannelConfig   json.RawMessage `json:"channel_config"`
	Enabled         *bool           `json:"enabled"`
}

// UpdateAlertRule updates an existing alert rule.
func (s *AlertService) UpdateAlertRule(ctx context.Context, orgID, id string, req *UpdateAlertRuleRequest) (*store.AlertRule, error) {
	existing, err := s.pg.GetAlertRule(ctx, orgID, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}

	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.Description != "" {
		existing.Description = req.Description
	}
	if req.ConditionType != "" {
		existing.ConditionType = req.ConditionType
	}
	if req.ConditionConfig != nil {
		existing.ConditionConfig = req.ConditionConfig
	}
	if req.Channels != nil {
		existing.Channels = req.Channels
	}
	if req.ChannelConfig != nil {
		existing.ChannelConfig = req.ChannelConfig
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}

	if err := s.pg.UpdateAlertRule(ctx, existing); err != nil {
		s.logger.Error("failed to update alert rule", "id", id, "error", err)
		return nil, err
	}

	s.logger.Info("updated alert rule", "id", id, "org_id", orgID)
	return existing, nil
}

// DeleteAlertRule removes an alert rule.
func (s *AlertService) DeleteAlertRule(ctx context.Context, orgID, id string) error {
	if err := s.pg.DeleteAlertRule(ctx, orgID, id); err != nil {
		if err == sql.ErrNoRows {
			return err
		}
		s.logger.Error("failed to delete alert rule", "id", id, "error", err)
		return err
	}

	s.logger.Info("deleted alert rule", "id", id, "org_id", orgID)
	return nil
}
