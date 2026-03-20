-- =============================================
-- AgentStack Dataset Management — Database Schema
-- =============================================

CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    schema JSONB DEFAULT '{}',
    item_count INTEGER NOT NULL DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'manual',   -- manual, production, import
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, name)
);

CREATE INDEX idx_datasets_org ON datasets(org_id);
CREATE INDEX idx_datasets_tags ON datasets USING GIN(tags);

CREATE TABLE dataset_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_items_dataset ON dataset_items(dataset_id);
CREATE INDEX idx_dataset_items_org ON dataset_items(org_id);

-- Link datasets to test suites (many-to-many)
CREATE TABLE dataset_suite_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    suite_id UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    org_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(dataset_id, suite_id)
);

CREATE INDEX idx_dataset_suite_links_dataset ON dataset_suite_links(dataset_id);
CREATE INDEX idx_dataset_suite_links_suite ON dataset_suite_links(suite_id);
