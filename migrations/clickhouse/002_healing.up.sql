CREATE TABLE IF NOT EXISTS agentstack.healing_events (
    id String,
    session_id String,
    span_id String DEFAULT '',
    org_id String,
    agent_name String DEFAULT '',
    healing_type Enum8('loop_breaker' = 1, 'hallucination_fix' = 2, 'cost_circuit_breaker' = 3, 'timeout_handler' = 4, 'error_recovery' = 5, 'custom' = 6),
    trigger_reason String DEFAULT '',
    action_taken String DEFAULT '',
    original_state String DEFAULT '{}',
    healed_state String DEFAULT '{}',
    success UInt8 DEFAULT 1,
    latency_ms UInt32 DEFAULT 0,
    metadata String DEFAULT '{}',
    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
) ENGINE = MergeTree()
ORDER BY (org_id, session_id, created_at, id)
PARTITION BY toYYYYMM(created_at)
