-- LLM Providers
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- openai, anthropic, google, together, groq, mistral
    display_name TEXT NOT NULL DEFAULT '',
    api_key_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted
    api_key_nonce TEXT NOT NULL,
    base_url TEXT NOT NULL DEFAULT '',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, name)
);

CREATE INDEX idx_providers_org_id ON providers(org_id);

-- Routing rules
CREATE TABLE IF NOT EXISTS routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    model_pattern TEXT NOT NULL DEFAULT '*', -- glob pattern: gpt-*, claude-*, *
    strategy TEXT NOT NULL DEFAULT 'priority' CHECK (strategy IN ('priority', 'cost', 'latency', 'round_robin')),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    target_model TEXT NOT NULL, -- actual model name at provider
    priority INTEGER NOT NULL DEFAULT 0,
    weight DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_routes_org_id ON routes(org_id);
CREATE INDEX idx_routes_model_pattern ON routes(model_pattern);

-- Fallback chains
CREATE TABLE IF NOT EXISTS fallback_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    model_pattern TEXT NOT NULL DEFAULT '*',
    chain JSONB NOT NULL DEFAULT '[]', -- [{provider_id, model, timeout_ms}]
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fallback_chains_org_id ON fallback_chains(org_id);

-- Semantic cache entries
CREATE TABLE IF NOT EXISTS cache_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cache_key TEXT NOT NULL, -- SHA-256 of normalized request
    model TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response JSONB NOT NULL,
    tokens_saved INTEGER NOT NULL DEFAULT 0,
    hit_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cache_entries_org_id ON cache_entries(org_id);
CREATE INDEX idx_cache_entries_cache_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_entries_expires_at ON cache_entries(expires_at);
