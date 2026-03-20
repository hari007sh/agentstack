-- Guardrail rules
CREATE TABLE IF NOT EXISTS guardrails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL, -- pii, toxicity, injection, hallucination, topic, code_exec, length, custom
    mode TEXT NOT NULL DEFAULT 'block' CHECK (mode IN ('block', 'warn', 'log')),
    config JSONB NOT NULL DEFAULT '{}',
    apply_to TEXT NOT NULL DEFAULT 'both' CHECK (apply_to IN ('input', 'output', 'both')),
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guardrails_org_id ON guardrails(org_id);
CREATE INDEX idx_guardrails_type ON guardrails(type);

-- Guard check events
CREATE TABLE IF NOT EXISTS guard_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    guardrail_id UUID NOT NULL REFERENCES guardrails(id) ON DELETE CASCADE,
    session_id TEXT,
    action TEXT NOT NULL, -- blocked, warned, passed
    guard_type TEXT NOT NULL,
    input_text TEXT,
    findings JSONB NOT NULL DEFAULT '{}',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guard_events_org_id ON guard_events(org_id);
CREATE INDEX idx_guard_events_guardrail_id ON guard_events(guardrail_id);
CREATE INDEX idx_guard_events_created_at ON guard_events(created_at);
CREATE INDEX idx_guard_events_action ON guard_events(action);
