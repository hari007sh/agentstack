package service

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATS subjects for trace ingestion.
const (
	SubjectSessionIngest = "trace.ingest.session"
	SubjectSpanIngest    = "trace.ingest.span"
	SubjectEventIngest   = "trace.ingest.event"
)

// IngestService publishes trace data to NATS for async ClickHouse writing.
type IngestService struct {
	nc     *nats.Conn
	logger *slog.Logger
}

// NewIngestService creates a new ingestion service.
func NewIngestService(nc *nats.Conn, logger *slog.Logger) *IngestService {
	return &IngestService{nc: nc, logger: logger}
}

// --- Ingestion Request Types ---

// SessionIngestRequest represents a session to be ingested.
type SessionIngestRequest struct {
	ID             string   `json:"id"`
	OrgID          string   `json:"org_id"`
	AgentName      string   `json:"agent_name"`
	AgentID        string   `json:"agent_id"`
	Status         string   `json:"status"`
	Input          string   `json:"input"`
	Output         string   `json:"output"`
	Error          string   `json:"error"`
	Metadata       string   `json:"metadata"`
	TotalTokens    uint64   `json:"total_tokens"`
	TotalCostCents uint64   `json:"total_cost_cents"`
	TotalSpans     uint32   `json:"total_spans"`
	DurationMs     uint64   `json:"duration_ms"`
	HasHealing     uint8    `json:"has_healing"`
	Tags           []string `json:"tags"`
	StartedAt      string   `json:"started_at"`
	EndedAt        string   `json:"ended_at"`
}

// SpanIngestRequest represents a span to be ingested.
type SpanIngestRequest struct {
	ID           string `json:"id"`
	SessionID    string `json:"session_id"`
	OrgID        string `json:"org_id"`
	ParentID     string `json:"parent_id"`
	Name         string `json:"name"`
	SpanType     string `json:"span_type"`
	Status       string `json:"status"`
	Input        string `json:"input"`
	Output       string `json:"output"`
	Error        string `json:"error"`
	Model        string `json:"model"`
	Provider     string `json:"provider"`
	InputTokens  uint32 `json:"input_tokens"`
	OutputTokens uint32 `json:"output_tokens"`
	TotalTokens  uint32 `json:"total_tokens"`
	CostCents    uint32 `json:"cost_cents"`
	DurationMs   uint64 `json:"duration_ms"`
	Metadata     string `json:"metadata"`
	StartedAt    string `json:"started_at"`
	EndedAt      string `json:"ended_at"`
}

// EventIngestRequest represents an event to be ingested.
type EventIngestRequest struct {
	ID        string `json:"id"`
	SessionID string `json:"session_id"`
	SpanID    string `json:"span_id"`
	OrgID     string `json:"org_id"`
	Type      string `json:"type"`
	Name      string `json:"name"`
	Data      string `json:"data"`
	CreatedAt string `json:"created_at"`
}

// BatchIngestRequest represents a batch of sessions, spans, and events.
type BatchIngestRequest struct {
	Sessions []SessionIngestRequest `json:"sessions"`
	Spans    []SpanIngestRequest    `json:"spans"`
	Events   []EventIngestRequest   `json:"events"`
}

// BatchIngestResult reports counts from a batch ingest.
type BatchIngestResult struct {
	Sessions int `json:"sessions"`
	Spans    int `json:"spans"`
	Events   int `json:"events"`
}

// --- Publish Methods ---

// IngestSession publishes a session to NATS.
func (s *IngestService) IngestSession(orgID string, req *SessionIngestRequest) error {
	s.fillSessionDefaults(orgID, req)

	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}

	if err := s.nc.Publish(SubjectSessionIngest, data); err != nil {
		return fmt.Errorf("publish session: %w", err)
	}

	s.logger.Debug("published session", "id", req.ID, "org_id", orgID)
	return nil
}

// IngestSpans publishes one or more spans to NATS.
func (s *IngestService) IngestSpans(orgID string, spans []SpanIngestRequest) error {
	for i := range spans {
		s.fillSpanDefaults(orgID, &spans[i])

		data, err := json.Marshal(&spans[i])
		if err != nil {
			return fmt.Errorf("marshal span: %w", err)
		}

		if err := s.nc.Publish(SubjectSpanIngest, data); err != nil {
			return fmt.Errorf("publish span: %w", err)
		}
	}

	s.logger.Debug("published spans", "count", len(spans), "org_id", orgID)
	return nil
}

// IngestEvents publishes one or more events to NATS.
func (s *IngestService) IngestEvents(orgID string, events []EventIngestRequest) error {
	for i := range events {
		s.fillEventDefaults(orgID, &events[i])

		data, err := json.Marshal(&events[i])
		if err != nil {
			return fmt.Errorf("marshal event: %w", err)
		}

		if err := s.nc.Publish(SubjectEventIngest, data); err != nil {
			return fmt.Errorf("publish event: %w", err)
		}
	}

	s.logger.Debug("published events", "count", len(events), "org_id", orgID)
	return nil
}

// IngestBatch publishes a batch of sessions, spans, and events to NATS.
func (s *IngestService) IngestBatch(orgID string, req *BatchIngestRequest) (*BatchIngestResult, error) {
	result := &BatchIngestResult{}

	for i := range req.Sessions {
		if err := s.IngestSession(orgID, &req.Sessions[i]); err != nil {
			return nil, fmt.Errorf("batch session %d: %w", i, err)
		}
		result.Sessions++
	}

	if len(req.Spans) > 0 {
		if err := s.IngestSpans(orgID, req.Spans); err != nil {
			return nil, fmt.Errorf("batch spans: %w", err)
		}
		result.Spans = len(req.Spans)
	}

	if len(req.Events) > 0 {
		if err := s.IngestEvents(orgID, req.Events); err != nil {
			return nil, fmt.Errorf("batch events: %w", err)
		}
		result.Events = len(req.Events)
	}

	return result, nil
}

// --- Defaults ---

func (s *IngestService) fillSessionDefaults(orgID string, req *SessionIngestRequest) {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.OrgID = orgID
	if req.Status == "" {
		req.Status = "running"
	}
	if req.Metadata == "" {
		req.Metadata = "{}"
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}
	if req.StartedAt == "" {
		req.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
}

func (s *IngestService) fillSpanDefaults(orgID string, req *SpanIngestRequest) {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.OrgID = orgID
	if req.Status == "" {
		req.Status = "running"
	}
	if req.Metadata == "" {
		req.Metadata = "{}"
	}
	if req.StartedAt == "" {
		req.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
}

func (s *IngestService) fillEventDefaults(orgID string, req *EventIngestRequest) {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.OrgID = orgID
	if req.Data == "" {
		req.Data = "{}"
	}
	if req.CreatedAt == "" {
		req.CreatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
}
