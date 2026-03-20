import { AgentStackClient } from './client';
import { SessionInstance } from './session';
import { HealingEngine } from './healing';
import { InitConfig, SessionConfig, HealingConfig } from './types';

// ─── Global State ───────────────────────────────────────────────────────────

let globalClient: AgentStackClient | null = null;
let globalSession: SessionInstance | null = null;
let globalHealing: HealingEngine | null = null;
let globalConfig: InitConfig | null = null;

// ─── Accessors (used by trace, instruments) ─────────────────────────────────

export function getGlobalClient(): AgentStackClient | null {
  return globalClient;
}

export function getGlobalSession(): SessionInstance | null {
  return globalSession;
}

export function getGlobalHealing(): HealingEngine | null {
  return globalHealing;
}

// ─── Core API ───────────────────────────────────────────────────────────────

/**
 * Initialize the AgentStack SDK.
 *
 * Must be called before any other SDK function. Sets up the HTTP client,
 * healing engine, and global configuration.
 *
 * @example
 * ```ts
 * import { init } from '@agentstack/sdk';
 *
 * init({
 *   apiKey: process.env.AGENTSTACK_API_KEY!,
 *   projectId: 'my-project',
 *   endpoint: 'https://api.agentstack.dev',
 * });
 * ```
 */
export function init(config: InitConfig): void {
  globalConfig = config;

  globalClient = new AgentStackClient({
    apiKey: config.apiKey,
    projectId: config.projectId,
    endpoint: config.endpoint,
    batchSize: config.batchSize,
    flushIntervalMs: config.flushIntervalMs,
    maxRetries: config.maxRetries,
    debug: config.debug,
  });

  if (config.healing) {
    globalHealing = new HealingEngine(config.healing, globalClient);
  }
}

/**
 * Create and start a new session.
 *
 * Sessions group related spans and events together. Each user interaction
 * or agent run should be wrapped in a session.
 *
 * @example
 * ```ts
 * const sess = session({ metadata: { userId: '123' } });
 * const span = sess.createSpan('processQuery', SpanType.AGENT);
 * // ... do work ...
 * span.end();
 * sess.end();
 * ```
 */
export function session(config?: SessionConfig): SessionInstance {
  if (!globalClient || !globalConfig) {
    throw new Error(
      'AgentStack SDK not initialized. Call init() before creating a session.',
    );
  }

  const sess = new SessionInstance(globalClient, globalConfig.projectId, config);
  globalSession = sess;

  // Set up healing engine for this session if configured
  if (config?.healing || globalConfig.healing) {
    globalHealing = new HealingEngine(
      config?.healing ?? globalConfig.healing,
      globalClient,
    );
  }

  return sess;
}

/**
 * Convenience wrapper that creates a session, runs a function, and closes the session.
 *
 * @example
 * ```ts
 * const result = await protect(
 *   { metadata: { task: 'summarize' } },
 *   async (sess) => {
 *     const span = sess.createSpan('summarize', SpanType.LLM);
 *     const result = await callLLM(...);
 *     span.end();
 *     return result;
 *   },
 * );
 * ```
 */
export async function protect<T>(
  config: SessionConfig,
  fn: (session: SessionInstance) => Promise<T>,
): Promise<T> {
  const sess = session(config);

  try {
    const result = await fn(sess);
    sess.end();
    return result;
  } catch (err) {
    sess.end();
    throw err;
  }
}

/**
 * Shutdown the SDK — flushes all pending events and cleans up resources.
 */
export async function shutdown(): Promise<void> {
  if (globalClient) {
    await globalClient.shutdown();
  }

  globalClient = null;
  globalSession = null;
  globalHealing = null;
  globalConfig = null;
}

// ── For testing: reset global state ──────────────────────────────────────

export function _resetForTesting(): void {
  if (globalClient) {
    // Stop flush timer without flushing
    void globalClient.shutdown().catch(() => {});
  }
  globalClient = null;
  globalSession = null;
  globalHealing = null;
  globalConfig = null;
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { AgentStackClient } from './client';
export { SessionInstance } from './session';
export { SpanInstance } from './span';
export { HealingEngine } from './healing';
export { trace } from './trace';
export { instrumentOpenAI } from './instruments/openai';
export { instrumentAnthropic } from './instruments/anthropic';
export { runGuards, checkGuard } from './guard';
export { estimateCost, registerModelPricing, getModelPricings } from './cost';

// Types
export type {
  GuardRule,
  GuardResult,
  GuardViolation,
} from './guard';

export type {
  ModelPricing,
  CostEstimate,
} from './cost';

export {
  SpanType,
  SessionStatus,
  SpanStatus,
} from './types';

export type {
  Session,
  Span,
  SpanError,
  TokenUsage,
  Event,
  HealingEvent,
  HealingType,
  HealingConfig,
  HealingIntervention,
  InitConfig,
  SessionConfig,
  TraceOptions,
} from './types';
