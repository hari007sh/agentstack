-- Cost events
CREATE TABLE IF NOT EXISTS cost_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id TEXT,
    span_id TEXT,
    agent_name TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0, -- integer cents, NEVER float
    outcome TEXT NOT NULL DEFAULT '', -- success, failure, timeout, healed
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cost_events_org_id ON cost_events(org_id);
CREATE INDEX idx_cost_events_session_id ON cost_events(session_id);
CREATE INDEX idx_cost_events_created_at ON cost_events(created_at);
CREATE INDEX idx_cost_events_model ON cost_events(model);
CREATE INDEX idx_cost_events_agent_name ON cost_events(agent_name);

-- Budget policies
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    scope TEXT NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'agent', 'model')),
    scope_value TEXT NOT NULL DEFAULT '', -- agent name or model name
    limit_cents INTEGER NOT NULL, -- budget limit in cents
    period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily', 'weekly', 'monthly')),
    action TEXT NOT NULL DEFAULT 'alert' CHECK (action IN ('alert', 'throttle', 'block')),
    current_spend_cents INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_threshold_pct INTEGER NOT NULL DEFAULT 80, -- alert at this % of limit
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budgets_org_id ON budgets(org_id);

-- Model pricing reference table
CREATE TABLE IF NOT EXISTS model_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_cost_per_1m INTEGER NOT NULL DEFAULT 0, -- cents per 1M tokens
    output_cost_per_1m INTEGER NOT NULL DEFAULT 0, -- cents per 1M tokens
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, model)
);
