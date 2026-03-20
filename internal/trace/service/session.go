package service

import (
	"context"
	"log/slog"

	"github.com/agentstack/agentstack/internal/trace/store"
)

// SessionService provides query access to trace sessions.
type SessionService struct {
	ch     *store.ClickHouseStore
	logger *slog.Logger
}

// NewSessionService creates a new session service.
func NewSessionService(ch *store.ClickHouseStore, logger *slog.Logger) *SessionService {
	return &SessionService{ch: ch, logger: logger}
}

// ListSessions returns sessions matching the filter.
func (s *SessionService) ListSessions(ctx context.Context, orgID string, f store.SessionFilter) ([]store.Session, int, error) {
	sessions, total, err := s.ch.ListSessions(ctx, orgID, f)
	if err != nil {
		s.logger.Error("failed to list sessions", "org_id", orgID, "error", err)
		return nil, 0, err
	}
	return sessions, total, nil
}

// GetSession returns a single session with its spans.
func (s *SessionService) GetSession(ctx context.Context, orgID, sessionID string) (*SessionDetail, error) {
	sess, err := s.ch.GetSession(ctx, orgID, sessionID)
	if err != nil {
		s.logger.Error("failed to get session", "id", sessionID, "error", err)
		return nil, err
	}
	if sess == nil {
		return nil, nil
	}

	spans, err := s.ch.GetSessionSpans(ctx, orgID, sessionID)
	if err != nil {
		s.logger.Error("failed to get session spans", "id", sessionID, "error", err)
		return nil, err
	}

	return &SessionDetail{
		Session: *sess,
		Spans:   spans,
	}, nil
}

// GetSessionSpans returns the spans for a session.
func (s *SessionService) GetSessionSpans(ctx context.Context, orgID, sessionID string) ([]store.Span, error) {
	spans, err := s.ch.GetSessionSpans(ctx, orgID, sessionID)
	if err != nil {
		s.logger.Error("failed to get session spans", "id", sessionID, "error", err)
		return nil, err
	}
	return spans, nil
}

// GetSessionEvents returns the events for a session.
func (s *SessionService) GetSessionEvents(ctx context.Context, orgID, sessionID string) ([]store.Event, error) {
	events, err := s.ch.GetSessionEvents(ctx, orgID, sessionID)
	if err != nil {
		s.logger.Error("failed to get session events", "id", sessionID, "error", err)
		return nil, err
	}
	return events, nil
}

// SessionDetail contains a session with its associated spans.
type SessionDetail struct {
	store.Session
	Spans []store.Span `json:"spans"`
}
