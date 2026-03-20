// ─── Enums ───────────────────────────────────────────────────────────────────

export enum SpanType {
  LLM = 'llm_call',
  TOOL = 'tool_call',
  RETRIEVAL = 'retrieval',
  CHAIN = 'chain',
  AGENT = 'agent',
  CUSTOM = 'custom',
}

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
}

export enum SpanStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  ERROR = 'error',
}

// ─── Core Interfaces ────────────────────────────────────────────────────────

export interface Session {
  id: string;
  projectId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  metadata?: Record<string, unknown>;
  spans: Span[];
  events: Event[];
}

export interface Span {
  id: string;
  sessionId: string;
  parentSpanId?: string;
  name: string;
  type: SpanType;
  status: SpanStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: SpanError;
  model?: string;
  tokens?: TokenUsage;
  metadata?: Record<string, unknown>;
}

export interface SpanError {
  message: string;
  type?: string;
  stack?: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface Event {
  id: string;
  sessionId: string;
  spanId?: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface HealingEvent {
  id: string;
  sessionId: string;
  spanId?: string;
  type: HealingType;
  trigger: string;
  intervention: HealingIntervention;
  timestamp: string;
  resolved: boolean;
}

// ─── Healing ─────────────────────────────────────────────────────────────────

export type HealingType =
  | 'loop_detection'
  | 'cost_breaker'
  | 'hallucination_catch'
  | 'timeout_recovery'
  | 'context_overflow';

export interface HealingConfig {
  enabled: boolean;
  loopDetection?: {
    enabled: boolean;
    maxRepeats: number;
    windowSize: number;
  };
  costBreaker?: {
    enabled: boolean;
    maxCostPerSession: number;
    maxCostPerSpan: number;
  };
  hallucinationCatch?: {
    enabled: boolean;
    confidenceThreshold: number;
  };
  timeoutRecovery?: {
    enabled: boolean;
    maxDurationMs: number;
  };
  contextOverflow?: {
    enabled: boolean;
    maxTokens: number;
    strategy: 'truncate' | 'summarize' | 'fail';
  };
}

export interface HealingIntervention {
  action: 'retry' | 'fallback' | 'abort' | 'modify_input' | 'notify';
  description: string;
  modifiedInput?: unknown;
  fallbackResult?: unknown;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface InitConfig {
  apiKey: string;
  projectId: string;
  endpoint?: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  healing?: HealingConfig;
  debug?: boolean;
}

export interface SessionConfig {
  metadata?: Record<string, unknown>;
  healing?: HealingConfig;
}

export interface TraceOptions {
  name?: string;
  type?: SpanType;
  sessionId?: string;
  parentSpanId?: string;
  captureInput?: boolean;
  captureOutput?: boolean;
  metadata?: Record<string, unknown>;
}
