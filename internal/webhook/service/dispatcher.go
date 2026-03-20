// Package service provides business logic for the Webhook module.
package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/agentstack/agentstack/internal/webhook/store"
	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
)

// NATS subject prefix for webhook events.
const SubjectWebhookPrefix = "webhooks."

// maxRetries is the maximum number of delivery attempts.
const maxRetries = 5

// retryBackoffs defines the backoff durations between retries.
var retryBackoffs = []time.Duration{
	1 * time.Minute,
	5 * time.Minute,
	30 * time.Minute,
	2 * time.Hour,
	12 * time.Hour,
}

// deliveryTimeout is the HTTP timeout for a single webhook delivery.
const deliveryTimeout = 10 * time.Second

// WebhookEvent is the payload published to NATS for async webhook delivery.
type WebhookEvent struct {
	OrgID   string                 `json:"org_id"`
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
}

// GenericWebhookPayload is the standard envelope for generic webhook deliveries.
type GenericWebhookPayload struct {
	ID        string                 `json:"id"`
	Event     string                 `json:"event"`
	Timestamp string                 `json:"timestamp"`
	OrgID     string                 `json:"org_id"`
	Data      map[string]interface{} `json:"data"`
}

// Dispatcher publishes webhook events to NATS and delivers them via HTTP.
type Dispatcher struct {
	pg         *store.PostgresStore
	nc         *nats.Conn
	httpClient *http.Client
	logger     *slog.Logger
}

// NewDispatcher creates a new webhook dispatcher.
func NewDispatcher(pg *store.PostgresStore, nc *nats.Conn, logger *slog.Logger) *Dispatcher {
	return &Dispatcher{
		pg: pg,
		nc: nc,
		httpClient: &http.Client{
			Timeout: deliveryTimeout,
		},
		logger: logger,
	}
}

// Dispatch publishes a webhook event to NATS for async delivery.
// This method never blocks the caller — it publishes and returns immediately.
func (d *Dispatcher) Dispatch(ctx context.Context, orgID, event string, payload map[string]interface{}) error {
	if d.nc == nil {
		return nil
	}

	evt := WebhookEvent{
		OrgID:   orgID,
		Event:   event,
		Payload: payload,
	}

	data, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal webhook event: %w", err)
	}

	subject := SubjectWebhookPrefix + event
	if err := d.nc.Publish(subject, data); err != nil {
		return fmt.Errorf("publish webhook event: %w", err)
	}

	d.logger.Debug("dispatched webhook event", "event", event, "org_id", orgID)
	return nil
}

// ProcessEvent handles a webhook event: queries active endpoints, creates delivery
// records, and sends HTTP requests.
func (d *Dispatcher) ProcessEvent(ctx context.Context, evt WebhookEvent) {
	endpoints, err := d.pg.ListActiveEndpointsForEvent(ctx, evt.OrgID, evt.Event)
	if err != nil {
		d.logger.Error("failed to list endpoints for event", "event", evt.Event, "error", err)
		return
	}

	if len(endpoints) == 0 {
		return
	}

	for _, ep := range endpoints {
		delivery := &store.WebhookDelivery{
			ID:         uuid.New().String(),
			EndpointID: ep.ID,
			OrgID:      evt.OrgID,
			Event:      evt.Event,
			Status:     "pending",
			Attempts:   0,
		}

		// Build payload based on endpoint type
		payloadBytes, err := d.buildPayload(ep, evt, delivery.ID)
		if err != nil {
			d.logger.Error("failed to build payload", "endpoint_id", ep.ID, "error", err)
			continue
		}
		delivery.Payload = payloadBytes

		// Create delivery record
		if err := d.pg.CreateDelivery(ctx, delivery); err != nil {
			d.logger.Error("failed to create delivery", "endpoint_id", ep.ID, "error", err)
			continue
		}

		// Attempt delivery
		d.attemptDelivery(ctx, &ep, delivery)
	}
}

// attemptDelivery sends an HTTP request and updates the delivery record.
func (d *Dispatcher) attemptDelivery(ctx context.Context, ep *store.WebhookEndpoint, delivery *store.WebhookDelivery) {
	delivery.Attempts++

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, ep.URL, bytes.NewReader(delivery.Payload))
	if err != nil {
		d.markFailed(ctx, delivery, 0, fmt.Sprintf("create request: %v", err))
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "AgentStack-Webhook/1.0")

	// Add custom headers from endpoint config
	if ep.Headers != nil {
		var headers map[string]string
		if err := json.Unmarshal(ep.Headers, &headers); err == nil {
			for k, v := range headers {
				req.Header.Set(k, v)
			}
		}
	}

	// For generic webhooks, add HMAC signature
	if ep.Type == "generic" && ep.Secret != "" {
		sig := computeHMAC(delivery.Payload, ep.Secret)
		req.Header.Set("X-AgentStack-Signature", "sha256="+sig)
		req.Header.Set("X-AgentStack-Event", delivery.Event)
		req.Header.Set("X-AgentStack-Delivery-ID", delivery.ID)
	}

	resp, err := d.httpClient.Do(req)
	if err != nil {
		d.scheduleRetryOrFail(ctx, delivery, 0, fmt.Sprintf("request failed: %v", err))
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		// Success
		now := time.Now()
		delivery.StatusCode = resp.StatusCode
		delivery.ResponseBody = string(body)
		delivery.Status = "delivered"
		delivery.DeliveredAt = &now

		if err := d.pg.UpdateDelivery(ctx, delivery); err != nil {
			d.logger.Error("failed to update delivery as delivered", "delivery_id", delivery.ID, "error", err)
		}

		d.logger.Info("webhook delivered", "delivery_id", delivery.ID, "endpoint_id", ep.ID, "status_code", resp.StatusCode)
	} else {
		d.scheduleRetryOrFail(ctx, delivery, resp.StatusCode, string(body))
	}
}

// scheduleRetryOrFail either schedules a retry or marks the delivery as failed.
func (d *Dispatcher) scheduleRetryOrFail(ctx context.Context, delivery *store.WebhookDelivery, statusCode int, responseBody string) {
	delivery.StatusCode = statusCode
	delivery.ResponseBody = responseBody

	if delivery.Attempts >= maxRetries {
		d.markFailed(ctx, delivery, statusCode, responseBody)
		return
	}

	// Schedule retry
	backoffIdx := delivery.Attempts - 1
	if backoffIdx < 0 {
		backoffIdx = 0
	}
	if backoffIdx >= len(retryBackoffs) {
		backoffIdx = len(retryBackoffs) - 1
	}
	nextRetry := time.Now().Add(retryBackoffs[backoffIdx])
	delivery.NextRetryAt = &nextRetry
	delivery.Status = "pending"

	if err := d.pg.UpdateDelivery(ctx, delivery); err != nil {
		d.logger.Error("failed to schedule retry", "delivery_id", delivery.ID, "error", err)
	}

	d.logger.Warn("webhook delivery failed, scheduling retry",
		"delivery_id", delivery.ID,
		"attempt", delivery.Attempts,
		"next_retry", nextRetry,
		"status_code", statusCode,
	)
}

// markFailed marks a delivery as permanently failed.
func (d *Dispatcher) markFailed(ctx context.Context, delivery *store.WebhookDelivery, statusCode int, responseBody string) {
	delivery.StatusCode = statusCode
	delivery.ResponseBody = responseBody
	delivery.Status = "failed"
	delivery.NextRetryAt = nil

	if err := d.pg.UpdateDelivery(ctx, delivery); err != nil {
		d.logger.Error("failed to mark delivery as failed", "delivery_id", delivery.ID, "error", err)
	}

	d.logger.Error("webhook delivery permanently failed",
		"delivery_id", delivery.ID,
		"attempts", delivery.Attempts,
		"status_code", statusCode,
	)
}

// buildPayload builds the HTTP request body based on endpoint type.
func (d *Dispatcher) buildPayload(ep store.WebhookEndpoint, evt WebhookEvent, deliveryID string) (json.RawMessage, error) {
	switch ep.Type {
	case "slack":
		msg := FormatSlackMessage(evt.Event, evt.Payload)
		return json.Marshal(msg)

	case "pagerduty":
		var routingKey string
		if ep.Headers != nil {
			var headers map[string]string
			if err := json.Unmarshal(ep.Headers, &headers); err == nil {
				routingKey = headers["X-Routing-Key"]
			}
		}
		pdEvent := FormatPagerDutyEvent(evt.Event, evt.Payload, routingKey)
		return json.Marshal(pdEvent)

	default:
		// Generic webhook
		payload := GenericWebhookPayload{
			ID:        deliveryID,
			Event:     evt.Event,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			OrgID:     evt.OrgID,
			Data:      evt.Payload,
		}
		return json.Marshal(payload)
	}
}

// RetryDelivery retries a specific failed delivery.
func (d *Dispatcher) RetryDelivery(ctx context.Context, orgID, deliveryID string) error {
	delivery, err := d.pg.GetDelivery(ctx, orgID, deliveryID)
	if err != nil {
		return fmt.Errorf("get delivery: %w", err)
	}
	if delivery == nil {
		return fmt.Errorf("delivery not found")
	}

	ep, err := d.pg.GetEndpoint(ctx, orgID, delivery.EndpointID)
	if err != nil {
		return fmt.Errorf("get endpoint: %w", err)
	}
	if ep == nil {
		return fmt.Errorf("endpoint not found")
	}

	// Reset status and attempt delivery
	delivery.Status = "pending"
	delivery.NextRetryAt = nil
	d.attemptDelivery(ctx, ep, delivery)

	return nil
}

// SendTestDelivery sends a test webhook to verify endpoint connectivity.
func (d *Dispatcher) SendTestDelivery(ctx context.Context, ep *store.WebhookEndpoint) (*store.WebhookDelivery, error) {
	testPayload := map[string]interface{}{
		"message": "This is a test webhook from AgentStack",
		"type":    "test",
	}

	evt := WebhookEvent{
		OrgID:   ep.OrgID,
		Event:   "test",
		Payload: testPayload,
	}

	delivery := &store.WebhookDelivery{
		ID:         uuid.New().String(),
		EndpointID: ep.ID,
		OrgID:      ep.OrgID,
		Event:      "test",
		Status:     "pending",
		Attempts:   0,
	}

	payloadBytes, err := d.buildPayload(*ep, evt, delivery.ID)
	if err != nil {
		return nil, fmt.Errorf("build payload: %w", err)
	}
	delivery.Payload = payloadBytes

	if err := d.pg.CreateDelivery(ctx, delivery); err != nil {
		return nil, fmt.Errorf("create delivery: %w", err)
	}

	d.attemptDelivery(ctx, ep, delivery)

	// Refetch to get updated status
	updated, err := d.pg.GetDelivery(ctx, ep.OrgID, delivery.ID)
	if err != nil {
		return delivery, nil
	}
	return updated, nil
}

// computeHMAC computes HMAC-SHA256 of the payload using the secret.
func computeHMAC(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
