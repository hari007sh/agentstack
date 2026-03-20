// Shared types for the AgentStack dashboard

export interface Session {
  id: string;
  org_id: string;
  agent_name: string;
  agent_id: string;
  status: "running" | "completed" | "failed" | "timeout" | "healed";
  input: string;
  output: string;
  error: string;
  metadata: Record<string, unknown>;
  total_tokens: number;
  total_cost_cents: number;
  total_spans: number;
  duration_ms: number;
  has_healing: boolean;
  tags: string[];
  started_at: string;
  ended_at: string;
  created_at: string;
}

export interface Span {
  id: string;
  session_id: string;
  parent_id: string;
  name: string;
  span_type: "llm_call" | "tool_call" | "retrieval" | "chain" | "agent" | "custom";
  status: "running" | "completed" | "failed" | "timeout";
  input: string;
  output: string;
  error: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_cents: number;
  duration_ms: number;
  metadata: Record<string, unknown>;
  started_at: string;
  ended_at: string;
}

export interface HealingEvent {
  id: string;
  session_id: string;
  span_id: string;
  agent_name: string;
  healing_type: "loop_breaker" | "hallucination_fix" | "cost_circuit_breaker" | "timeout_handler" | "error_recovery" | "custom";
  trigger_reason: string;
  action_taken: string;
  success: boolean;
  latency_ms: number;
  created_at: string;
}

export interface Agent {
  id: string;
  org_id: string;
  name: string;
  description: string;
  framework: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FailurePattern {
  id: string;
  org_id: string;
  name: string;
  description: string;
  category: string;
  detection_rules: Record<string, unknown>;
  severity: "low" | "medium" | "high" | "critical";
  is_builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRule {
  id: string;
  org_id: string;
  name: string;
  description: string;
  condition_type: string;
  condition_config: Record<string, unknown>;
  channels: string[];
  channel_config: Record<string, unknown>;
  enabled: boolean;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  agent_id: string;
  tags: string[];
  created_at: string;
}

export interface TestRun {
  id: string;
  suite_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  error_cases: number;
  avg_score: number;
  duration_ms: number;
  created_at: string;
}

export interface Guardrail {
  id: string;
  name: string;
  description: string;
  type: string;
  mode: "block" | "warn" | "log";
  apply_to: "input" | "output" | "both";
  enabled: boolean;
  priority: number;
}

export interface Provider {
  id: string;
  name: string;
  display_name: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
}

export interface CostEvent {
  id: string;
  session_id: string;
  agent_name: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  outcome: string;
  created_at: string;
}

export interface Budget {
  id: string;
  name: string;
  scope: "org" | "agent" | "model";
  scope_value: string;
  limit_cents: number;
  current_spend_cents: number;
  period: "daily" | "weekly" | "monthly";
  action: "alert" | "throttle" | "block";
  alert_threshold_pct: number;
  enabled: boolean;
}

export interface OverviewStats {
  total_sessions: number;
  active_sessions: number;
  failure_rate: number;
  avg_cost_cents: number;
  total_cost_cents: number;
  healing_interventions: number;
  healing_success_rate: number;
  reliability_score: number;
}
