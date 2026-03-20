// Package store provides PostgreSQL CRUD operations for the Webhook module.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// PostgresStore provides CRUD access to webhook data in PostgreSQL.
type PostgresStore struct {
	db *sql.DB
}

// NewPostgresStore creates a new PostgreSQL store for the Webhook module.
func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

// DB returns the underlying database connection.
func (s *PostgresStore) DB() *sql.DB {
	return s.db
}

// ========================
// Domain Structs
// ========================

// WebhookEndpoint represents a webhook delivery destination.
type WebhookEndpoint struct {
	ID        string          `json:"id"`
	OrgID     string          `json:"org_id"`
	Name      string          `json:"name"`
	Type      string          `json:"type"`      // generic, slack, pagerduty
	URL       string          `json:"url"`
	Secret    string          `json:"secret,omitempty"`
	Events    []string        `json:"events"`
	Headers   json.RawMessage `json:"headers"`
	IsActive  bool            `json:"is_active"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// WebhookDelivery represents a single webhook delivery attempt record.
type WebhookDelivery struct {
	ID           string          `json:"id"`
	EndpointID   string          `json:"endpoint_id"`
	OrgID        string          `json:"org_id"`
	Event        string          `json:"event"`
	Payload      json.RawMessage `json:"payload"`
	StatusCode   int             `json:"status_code"`
	ResponseBody string          `json:"response_body"`
	Attempts     int             `json:"attempts"`
	Status       string          `json:"status"` // pending, delivered, failed
	NextRetryAt  *time.Time      `json:"next_retry_at,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	DeliveredAt  *time.Time      `json:"delivered_at,omitempty"`
}

// ========================
// WebhookEndpoint CRUD
// ========================

// CreateEndpoint inserts a new webhook endpoint.
func (s *PostgresStore) CreateEndpoint(ctx context.Context, ep *WebhookEndpoint) error {
	if ep.ID == "" {
		ep.ID = uuid.New().String()
	}
	if ep.Headers == nil {
		ep.Headers = json.RawMessage(`{}`)
	}

	query := `INSERT INTO webhook_endpoints (id, org_id, name, type, url, secret, events, headers, is_active)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	          RETURNING created_at, updated_at`

	return s.db.QueryRowContext(ctx, query,
		ep.ID, ep.OrgID, ep.Name, ep.Type, ep.URL, ep.Secret, ep.Events, ep.Headers, ep.IsActive,
	).Scan(&ep.CreatedAt, &ep.UpdatedAt)
}

// GetEndpoint returns a single webhook endpoint by ID.
func (s *PostgresStore) GetEndpoint(ctx context.Context, orgID, id string) (*WebhookEndpoint, error) {
	query := `SELECT id, org_id, name, type, url, secret, events, headers, is_active, created_at, updated_at
	          FROM webhook_endpoints WHERE org_id = $1 AND id = $2`

	var ep WebhookEndpoint
	err := s.db.QueryRowContext(ctx, query, orgID, id).Scan(
		&ep.ID, &ep.OrgID, &ep.Name, &ep.Type, &ep.URL, &ep.Secret,
		&ep.Events, &ep.Headers, &ep.IsActive, &ep.CreatedAt, &ep.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get endpoint: %w", err)
	}
	if ep.Events == nil {
		ep.Events = []string{}
	}
	return &ep, nil
}

// ListEndpoints returns all webhook endpoints for an organization.
func (s *PostgresStore) ListEndpoints(ctx context.Context, orgID string) ([]WebhookEndpoint, error) {
	query := `SELECT id, org_id, name, type, url, secret, events, headers, is_active, created_at, updated_at
	          FROM webhook_endpoints WHERE org_id = $1
	          ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}
	defer rows.Close()

	var endpoints []WebhookEndpoint
	for rows.Next() {
		var ep WebhookEndpoint
		if err := rows.Scan(&ep.ID, &ep.OrgID, &ep.Name, &ep.Type, &ep.URL, &ep.Secret,
			&ep.Events, &ep.Headers, &ep.IsActive, &ep.CreatedAt, &ep.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan endpoint: %w", err)
		}
		if ep.Events == nil {
			ep.Events = []string{}
		}
		endpoints = append(endpoints, ep)
	}
	if endpoints == nil {
		endpoints = []WebhookEndpoint{}
	}
	return endpoints, rows.Err()
}

// UpdateEndpoint updates a webhook endpoint.
func (s *PostgresStore) UpdateEndpoint(ctx context.Context, ep *WebhookEndpoint) error {
	query := `UPDATE webhook_endpoints
	          SET name = $1, type = $2, url = $3, secret = $4, events = $5,
	              headers = $6, is_active = $7, updated_at = NOW()
	          WHERE org_id = $8 AND id = $9
	          RETURNING updated_at`

	return s.db.QueryRowContext(ctx, query,
		ep.Name, ep.Type, ep.URL, ep.Secret, ep.Events,
		ep.Headers, ep.IsActive, ep.OrgID, ep.ID,
	).Scan(&ep.UpdatedAt)
}

// DeleteEndpoint deletes a webhook endpoint and cascades to deliveries.
func (s *PostgresStore) DeleteEndpoint(ctx context.Context, orgID, id string) error {
	query := `DELETE FROM webhook_endpoints WHERE org_id = $1 AND id = $2`
	result, err := s.db.ExecContext(ctx, query, orgID, id)
	if err != nil {
		return fmt.Errorf("delete endpoint: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ListActiveEndpointsForEvent returns active endpoints subscribed to a given event type.
func (s *PostgresStore) ListActiveEndpointsForEvent(ctx context.Context, orgID, event string) ([]WebhookEndpoint, error) {
	query := `SELECT id, org_id, name, type, url, secret, events, headers, is_active, created_at, updated_at
	          FROM webhook_endpoints
	          WHERE org_id = $1 AND is_active = true AND $2 = ANY(events)
	          ORDER BY created_at ASC`

	rows, err := s.db.QueryContext(ctx, query, orgID, event)
	if err != nil {
		return nil, fmt.Errorf("list active endpoints for event: %w", err)
	}
	defer rows.Close()

	var endpoints []WebhookEndpoint
	for rows.Next() {
		var ep WebhookEndpoint
		if err := rows.Scan(&ep.ID, &ep.OrgID, &ep.Name, &ep.Type, &ep.URL, &ep.Secret,
			&ep.Events, &ep.Headers, &ep.IsActive, &ep.CreatedAt, &ep.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan endpoint: %w", err)
		}
		if ep.Events == nil {
			ep.Events = []string{}
		}
		endpoints = append(endpoints, ep)
	}
	if endpoints == nil {
		endpoints = []WebhookEndpoint{}
	}
	return endpoints, rows.Err()
}

// ========================
// WebhookDelivery CRUD
// ========================

// CreateDelivery inserts a new delivery record.
func (s *PostgresStore) CreateDelivery(ctx context.Context, d *WebhookDelivery) error {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}

	query := `INSERT INTO webhook_deliveries (id, endpoint_id, org_id, event, payload, status_code, response_body, attempts, status, next_retry_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	          RETURNING created_at`

	return s.db.QueryRowContext(ctx, query,
		d.ID, d.EndpointID, d.OrgID, d.Event, d.Payload,
		d.StatusCode, d.ResponseBody, d.Attempts, d.Status, d.NextRetryAt,
	).Scan(&d.CreatedAt)
}

// UpdateDelivery updates a delivery record after an attempt.
func (s *PostgresStore) UpdateDelivery(ctx context.Context, d *WebhookDelivery) error {
	query := `UPDATE webhook_deliveries
	          SET status_code = $1, response_body = $2, attempts = $3, status = $4,
	              next_retry_at = $5, delivered_at = $6
	          WHERE id = $7`

	_, err := s.db.ExecContext(ctx, query,
		d.StatusCode, d.ResponseBody, d.Attempts, d.Status,
		d.NextRetryAt, d.DeliveredAt, d.ID,
	)
	return err
}

// ListDeliveries returns paginated deliveries for an endpoint.
func (s *PostgresStore) ListDeliveries(ctx context.Context, orgID, endpointID string, limit, offset int) ([]WebhookDelivery, int, error) {
	if limit <= 0 {
		limit = 50
	}

	countQuery := `SELECT COUNT(*) FROM webhook_deliveries WHERE org_id = $1 AND endpoint_id = $2`
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, orgID, endpointID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count deliveries: %w", err)
	}

	query := `SELECT id, endpoint_id, org_id, event, payload, status_code, response_body,
	                 attempts, status, next_retry_at, created_at, delivered_at
	          FROM webhook_deliveries WHERE org_id = $1 AND endpoint_id = $2
	          ORDER BY created_at DESC
	          LIMIT $3 OFFSET $4`

	rows, err := s.db.QueryContext(ctx, query, orgID, endpointID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list deliveries: %w", err)
	}
	defer rows.Close()

	var deliveries []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.EndpointID, &d.OrgID, &d.Event, &d.Payload,
			&d.StatusCode, &d.ResponseBody, &d.Attempts, &d.Status,
			&d.NextRetryAt, &d.CreatedAt, &d.DeliveredAt); err != nil {
			return nil, 0, fmt.Errorf("scan delivery: %w", err)
		}
		deliveries = append(deliveries, d)
	}
	if deliveries == nil {
		deliveries = []WebhookDelivery{}
	}
	return deliveries, total, rows.Err()
}

// GetDelivery returns a single delivery by ID.
func (s *PostgresStore) GetDelivery(ctx context.Context, orgID, deliveryID string) (*WebhookDelivery, error) {
	query := `SELECT id, endpoint_id, org_id, event, payload, status_code, response_body,
	                 attempts, status, next_retry_at, created_at, delivered_at
	          FROM webhook_deliveries WHERE org_id = $1 AND id = $2`

	var d WebhookDelivery
	err := s.db.QueryRowContext(ctx, query, orgID, deliveryID).Scan(
		&d.ID, &d.EndpointID, &d.OrgID, &d.Event, &d.Payload,
		&d.StatusCode, &d.ResponseBody, &d.Attempts, &d.Status,
		&d.NextRetryAt, &d.CreatedAt, &d.DeliveredAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get delivery: %w", err)
	}
	return &d, nil
}

// ListPendingDeliveries returns deliveries that are ready for retry.
func (s *PostgresStore) ListPendingDeliveries(ctx context.Context, limit int) ([]WebhookDelivery, error) {
	if limit <= 0 {
		limit = 100
	}

	query := `SELECT id, endpoint_id, org_id, event, payload, status_code, response_body,
	                 attempts, status, next_retry_at, created_at, delivered_at
	          FROM webhook_deliveries
	          WHERE status = 'pending'
	            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
	          ORDER BY created_at ASC
	          LIMIT $1`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("list pending deliveries: %w", err)
	}
	defer rows.Close()

	var deliveries []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.EndpointID, &d.OrgID, &d.Event, &d.Payload,
			&d.StatusCode, &d.ResponseBody, &d.Attempts, &d.Status,
			&d.NextRetryAt, &d.CreatedAt, &d.DeliveredAt); err != nil {
			return nil, fmt.Errorf("scan delivery: %w", err)
		}
		deliveries = append(deliveries, d)
	}
	if deliveries == nil {
		deliveries = []WebhookDelivery{}
	}
	return deliveries, rows.Err()
}

// CleanupOldDeliveries deletes deliveries older than the given duration.
func (s *PostgresStore) CleanupOldDeliveries(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().Add(-olderThan)
	query := `DELETE FROM webhook_deliveries WHERE created_at < $1`
	result, err := s.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("cleanup deliveries: %w", err)
	}
	return result.RowsAffected()
}
