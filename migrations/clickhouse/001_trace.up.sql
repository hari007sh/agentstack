CREATE DATABASE IF NOT EXISTS agentstack;

CREATE TABLE IF NOT EXISTS agentstack.sessions (
    id String,
    org_id String,
    agent_name String DEFAULT '',
    agent_id String DEFAULT '',
    status Enum8('running' = 1, 'completed' = 2, 'failed' = 3, 'timeout' = 4, 'healed' = 5),
    input String DEFAULT '',
    output String DEFAULT '',
    error String DEFAULT '',
    metadata String DEFAULT '{}',
    total_tokens UInt64 DEFAULT 0,
    total_cost_cents UInt64 DEFAULT 0,
    total_spans UInt32 DEFAULT 0,
    duration_ms UInt64 DEFAULT 0,
    has_healing UInt8 DEFAULT 0,
    tags Array(String) DEFAULT [],
    started_at DateTime64(3, 'UTC'),
    ended_at DateTime64(3, 'UTC') DEFAULT toDateTime64('1970-01-01 00:00:00.000', 3, 'UTC'),
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (org_id, started_at, id)
PARTITION BY toYYYYMM(started_at);

CREATE TABLE IF NOT EXISTS agentstack.spans (
    id String,
    session_id String,
    org_id String,
    parent_id String DEFAULT '',
    name String DEFAULT '',
    span_type Enum8('llm_call' = 1, 'tool_call' = 2, 'retrieval' = 3, 'chain' = 4, 'agent' = 5, 'custom' = 6),
    status Enum8('running' = 1, 'completed' = 2, 'failed' = 3, 'timeout' = 4),
    input String DEFAULT '',
    output String DEFAULT '',
    error String DEFAULT '',
    model String DEFAULT '',
    provider String DEFAULT '',
    input_tokens UInt32 DEFAULT 0,
    output_tokens UInt32 DEFAULT 0,
    total_tokens UInt32 DEFAULT 0,
    cost_cents UInt32 DEFAULT 0,
    duration_ms UInt64 DEFAULT 0,
    metadata String DEFAULT '{}',
    started_at DateTime64(3, 'UTC'),
    ended_at DateTime64(3, 'UTC') DEFAULT toDateTime64('1970-01-01 00:00:00.000', 3, 'UTC'),
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (org_id, session_id, started_at, id)
PARTITION BY toYYYYMM(started_at);

CREATE TABLE IF NOT EXISTS agentstack.events (
    id String,
    session_id String,
    span_id String DEFAULT '',
    org_id String,
    type String DEFAULT '',
    name String DEFAULT '',
    data String DEFAULT '{}',
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (org_id, session_id, created_at, id)
PARTITION BY toYYYYMM(created_at);

CREATE TABLE IF NOT EXISTS agentstack.gateway_requests (
    id String,
    org_id String,
    model String DEFAULT '',
    provider String DEFAULT '',
    status Enum8('success' = 1, 'error' = 2, 'timeout' = 3, 'cache_hit' = 4),
    input_tokens UInt32 DEFAULT 0,
    output_tokens UInt32 DEFAULT 0,
    total_tokens UInt32 DEFAULT 0,
    cost_cents UInt32 DEFAULT 0,
    latency_ms UInt32 DEFAULT 0,
    cache_hit UInt8 DEFAULT 0,
    fallback_used UInt8 DEFAULT 0,
    error String DEFAULT '',
    metadata String DEFAULT '{}',
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (org_id, created_at, id)
PARTITION BY toYYYYMM(created_at)
