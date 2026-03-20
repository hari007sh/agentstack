-- =============================================
-- AgentStack Webhook Integrations — Database Schema
-- =============================================

CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'generic',     -- generic, slack, pagerduty
    url TEXT NOT NULL,                         -- encrypted at rest
    secret TEXT DEFAULT '',                    -- HMAC-SHA256 signing secret (encrypted)
    events TEXT[] NOT NULL DEFAULT '{}',       -- which events trigger this webhook
    headers JSONB DEFAULT '{}',               -- custom HTTP headers
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(org_id);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(org_id, is_active) WHERE is_active = true;
CREATE INDEX idx_webhook_endpoints_events ON webhook_endpoints USING GIN(events);

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    status_code INTEGER DEFAULT 0,
    response_body TEXT DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending, delivered, failed
    next_retry_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_webhook_deliveries_org ON webhook_deliveries(org_id, created_at DESC);
