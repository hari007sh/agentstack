package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"time"

	webhookservice "github.com/agentstack/agentstack/internal/webhook/service"
	webhookstore "github.com/agentstack/agentstack/internal/webhook/store"
	"github.com/nats-io/nats.go"
)

// WebhookSender is a NATS consumer that delivers webhooks.
// It subscribes to webhooks.* subjects and processes them through the dispatcher.
// It also periodically retries failed deliveries.
type WebhookSender struct {
	nc         *nats.Conn
	dispatcher *webhookservice.Dispatcher
	pg         *webhookstore.PostgresStore
	logger     *slog.Logger
	done       chan struct{}
	subs       []*nats.Subscription
}

// NewWebhookSender creates a new webhook sender worker.
func NewWebhookSender(nc *nats.Conn, pgDB *sql.DB, logger *slog.Logger) *WebhookSender {
	pg := webhookstore.NewPostgresStore(pgDB)
	dispatcher := webhookservice.NewDispatcher(pg, nc, logger)

	return &WebhookSender{
		nc:         nc,
		dispatcher: dispatcher,
		pg:         pg,
		logger:     logger,
		done:       make(chan struct{}),
	}
}

// Start subscribes to all webhook NATS subjects and begins the retry loop.
func (ws *WebhookSender) Start() error {
	// Subscribe to the wildcard subject for all webhook events
	sub, err := ws.nc.Subscribe(webhookservice.SubjectWebhookPrefix+">", ws.handleWebhookEvent)
	if err != nil {
		return err
	}
	ws.subs = append(ws.subs, sub)

	ws.logger.Info("webhook sender started",
		"subject", webhookservice.SubjectWebhookPrefix+">",
	)

	// Start retry loop for failed deliveries
	go ws.retryLoop()

	// Start cleanup loop for old deliveries (30 day retention)
	go ws.cleanupLoop()

	return nil
}

// Stop gracefully shuts down the webhook sender.
func (ws *WebhookSender) Stop() {
	close(ws.done)
	for _, sub := range ws.subs {
		if err := sub.Unsubscribe(); err != nil {
			ws.logger.Warn("failed to unsubscribe webhook sender", "error", err)
		}
	}
	ws.logger.Info("webhook sender stopped")
}

// handleWebhookEvent processes a single webhook event from NATS.
func (ws *WebhookSender) handleWebhookEvent(msg *nats.Msg) {
	var evt webhookservice.WebhookEvent
	if err := json.Unmarshal(msg.Data, &evt); err != nil {
		ws.logger.Error("failed to unmarshal webhook event", "error", err)
		return
	}

	if evt.OrgID == "" || evt.Event == "" {
		ws.logger.Error("webhook event missing org_id or event type")
		return
	}

	ws.logger.Info("processing webhook event", "event", evt.Event, "org_id", evt.OrgID)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	ws.dispatcher.ProcessEvent(ctx, evt)
}

// retryLoop periodically retries pending webhook deliveries.
func (ws *WebhookSender) retryLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ws.retryPending()
		case <-ws.done:
			return
		}
	}
}

// retryPending fetches and retries pending deliveries that are past their retry time.
func (ws *WebhookSender) retryPending() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	deliveries, err := ws.pg.ListPendingDeliveries(ctx, 50)
	if err != nil {
		ws.logger.Error("failed to list pending deliveries", "error", err)
		return
	}

	if len(deliveries) == 0 {
		return
	}

	ws.logger.Info("retrying pending deliveries", "count", len(deliveries))

	for _, delivery := range deliveries {
		ep, err := ws.pg.GetEndpoint(ctx, delivery.OrgID, delivery.EndpointID)
		if err != nil || ep == nil {
			ws.logger.Error("failed to get endpoint for retry",
				"delivery_id", delivery.ID,
				"endpoint_id", delivery.EndpointID,
				"error", err,
			)
			continue
		}

		// Re-process: the dispatcher will attempt delivery and update the record
		evt := webhookservice.WebhookEvent{
			OrgID: delivery.OrgID,
			Event: delivery.Event,
		}
		// Unmarshal payload back
		var payload map[string]interface{}
		if err := json.Unmarshal(delivery.Payload, &payload); err == nil {
			evt.Payload = payload
		}

		ws.dispatcher.ProcessEvent(ctx, evt)
	}
}

// cleanupLoop periodically removes old delivery records.
func (ws *WebhookSender) cleanupLoop() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ws.cleanup()
		case <-ws.done:
			return
		}
	}
}

// cleanup removes delivery records older than 30 days.
func (ws *WebhookSender) cleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	count, err := ws.pg.CleanupOldDeliveries(ctx, 30*24*time.Hour)
	if err != nil {
		ws.logger.Error("failed to cleanup old deliveries", "error", err)
		return
	}

	if count > 0 {
		ws.logger.Info("cleaned up old deliveries", "deleted", count)
	}
}
