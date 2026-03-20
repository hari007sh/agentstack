-- =============================================
-- AgentStack Prompt Management — Database Schema
-- =============================================

CREATE TABLE prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    active_version INTEGER NOT NULL DEFAULT 1,
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, slug)
);

CREATE INDEX idx_prompts_org ON prompts(org_id);
CREATE INDEX idx_prompts_slug ON prompts(org_id, slug);
CREATE INDEX idx_prompts_tags ON prompts USING GIN(tags);

CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    version INTEGER NOT NULL,
    body TEXT NOT NULL,
    model TEXT DEFAULT '',
    variables JSONB DEFAULT '{}',
    system_prompt TEXT DEFAULT '',
    config JSONB DEFAULT '{}',
    change_note TEXT DEFAULT '',
    created_by TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(prompt_id, version)
);

CREATE INDEX idx_prompt_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX idx_prompt_versions_lookup ON prompt_versions(prompt_id, version);
