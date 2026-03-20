import {
  init,
  session,
  protect,
  shutdown,
  trace,
  _resetForTesting,
  AgentStackClient,
  SessionInstance,
  SpanInstance,
  HealingEngine,
  SpanType,
  SessionStatus,
  SpanStatus,
  estimateCost,
  registerModelPricing,
  getModelPricings,
  runGuards,
  checkGuard,
} from '../src/index';

import type {
  InitConfig,
  Session,
  Span,
  Event,
  HealingEvent,
  HealingConfig,
  HealingIntervention,
  SessionConfig,
  TraceOptions,
  SpanError,
  TokenUsage,
  HealingType,
  GuardRule,
  GuardResult,
  GuardViolation,
  ModelPricing,
  CostEstimate,
} from '../src/index';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TEST_CONFIG: InitConfig = {
  apiKey: 'test-api-key-123',
  projectId: 'test-project',
  endpoint: 'https://test.agentstack.dev',
  batchSize: 100,
  flushIntervalMs: 0, // disable auto-flush in tests
  maxRetries: 1,
  debug: false,
};

beforeEach(() => {
  _resetForTesting();
});

afterAll(async () => {
  _resetForTesting();
});

// ─── Client Initialization ─────────────────────────────────────────────────

describe('Client Initialization', () => {
  test('init() sets up global client', () => {
    init(TEST_CONFIG);
    // session() should not throw after init
    const sess = session();
    expect(sess).toBeInstanceOf(SessionInstance);
    expect(sess.id).toBeDefined();
    expect(sess.projectId).toBe('test-project');
  });

  test('session() throws before init()', () => {
    expect(() => session()).toThrow('AgentStack SDK not initialized');
  });

  test('init() with healing config', () => {
    init({
      ...TEST_CONFIG,
      healing: {
        enabled: true,
        loopDetection: { enabled: true, maxRepeats: 5, windowSize: 20 },
      },
    });

    const sess = session();
    expect(sess).toBeDefined();
  });

  test('AgentStackClient stores config correctly', () => {
    const client = new AgentStackClient({
      apiKey: 'key',
      projectId: 'proj',
      endpoint: 'https://custom.endpoint.dev',
      batchSize: 25,
      flushIntervalMs: 0,
      maxRetries: 2,
      debug: false,
    });

    expect(client.endpoint).toBe('https://custom.endpoint.dev');
    expect(client.projectId).toBe('proj');
    expect(client.pendingEventCount).toBe(0);
    expect(client.pendingHealingEventCount).toBe(0);
  });
});

// ─── Session / Span Lifecycle ───────────────────────────────────────────────

describe('Session / Span Lifecycle', () => {
  beforeEach(() => {
    init(TEST_CONFIG);
  });

  test('session creates with ACTIVE status', () => {
    const sess = session({ metadata: { userId: 'u1' } });
    expect(sess.status).toBe(SessionStatus.ACTIVE);
  });

  test('session.end() returns session data', () => {
    const sess = session();
    const data = sess.end();

    expect(data.id).toBe(sess.id);
    expect(data.status).toBe(SessionStatus.COMPLETED);
    expect(data.endedAt).toBeDefined();
  });

  test('session.end(FAILED) sets correct status', () => {
    const sess = session();
    const data = sess.end(SessionStatus.FAILED);
    expect(data.status).toBe(SessionStatus.FAILED);
  });

  test('createSpan creates a span with correct type', () => {
    const sess = session();
    const span = sess.createSpan('test-span', SpanType.LLM);

    expect(span).toBeInstanceOf(SpanInstance);
    expect(span.name).toBe('test-span');
    expect(span.type).toBe(SpanType.LLM);
    expect(span.status).toBe(SpanStatus.RUNNING);
    expect(span.sessionId).toBe(sess.id);
  });

  test('span.end() calculates duration', () => {
    const sess = session();
    const span = sess.createSpan('timed-span', SpanType.TOOL);

    // Small delay to get measurable duration
    const data = span.end();

    expect(data.status).toBe(SpanStatus.COMPLETED);
    expect(data.durationMs).toBeDefined();
    expect(typeof data.durationMs).toBe('number');
    expect(data.endedAt).toBeDefined();
  });

  test('span.setInput/setOutput captures data', () => {
    const sess = session();
    const span = sess.createSpan('io-span');

    span.setInput({ query: 'test' });
    span.setOutput({ answer: 'result' });

    const data = span.end();
    expect(data.input).toEqual({ query: 'test' });
    expect(data.output).toEqual({ answer: 'result' });
  });

  test('span.setError sets error status', () => {
    const sess = session();
    const span = sess.createSpan('error-span');

    span.setError(new Error('something broke'));

    const data = span.end();
    expect(data.status).toBe(SpanStatus.ERROR);
    expect(data.error?.message).toBe('something broke');
    expect(data.error?.type).toBe('Error');
  });

  test('span.setError with string', () => {
    const sess = session();
    const span = sess.createSpan('error-span');

    span.setError('plain error message');

    const data = span.end();
    expect(data.error?.message).toBe('plain error message');
  });

  test('span.setTokens and setModel', () => {
    const sess = session();
    const span = sess.createSpan('llm-span', SpanType.LLM);

    span.setModel('gpt-4');
    span.setTokens(100, 50);

    const data = span.end();
    expect(data.model).toBe('gpt-4');
    expect(data.tokens?.prompt).toBe(100);
    expect(data.tokens?.completion).toBe(50);
    expect(data.tokens?.total).toBe(150);
  });

  test('nested spans via createChildSpan', () => {
    const sess = session();
    const parent = sess.createSpan('parent', SpanType.AGENT);
    const child = parent.createChildSpan('child', SpanType.LLM);

    expect(child.parentSpanId).toBe(parent.id);

    child.end();
    parent.end();
  });

  test('session.end() ends remaining active spans', () => {
    const sess = session();
    sess.createSpan('auto-ended', SpanType.CUSTOM);

    const data = sess.end();
    expect(data.spans.length).toBe(1);
    expect(data.spans[0].status).toBe(SpanStatus.COMPLETED);
  });

  test('session.addEvent records custom events', () => {
    const sess = session();
    sess.addEvent('custom.event', { key: 'value' });

    const data = sess.end();
    expect(data.events.length).toBeGreaterThanOrEqual(1);
    const customEvent = data.events.find(e => e.type === 'custom.event');
    expect(customEvent).toBeDefined();
    expect(customEvent?.data.key).toBe('value');
  });
});

// ─── Trace Wrapper ──────────────────────────────────────────────────────────

describe('Trace Wrapper', () => {
  beforeEach(() => {
    init(TEST_CONFIG);
    session();
  });

  test('trace() wraps async function and returns result', async () => {
    const result = await trace('my-trace', async (span) => {
      expect(span).toBeInstanceOf(SpanInstance);
      return 42;
    });
    expect(result).toBe(42);
  });

  test('trace() with options', async () => {
    const result = await trace(
      'my-trace',
      { type: SpanType.LLM, metadata: { test: true } },
      async (span) => {
        span.setModel('gpt-4');
        return 'hello';
      },
    );
    expect(result).toBe('hello');
  });

  test('trace() captures and re-throws errors', async () => {
    await expect(
      trace('failing-trace', async () => {
        throw new Error('trace error');
      }),
    ).rejects.toThrow('trace error');
  });

  test('trace() without init passes through', async () => {
    _resetForTesting();

    const result = await trace('no-init', async () => {
      return 'passthrough';
    });

    expect(result).toBe('passthrough');
  });
});

// ─── Protect Function ───────────────────────────────────────────────────────

describe('Protect Function', () => {
  beforeEach(() => {
    init(TEST_CONFIG);
  });

  test('protect() creates session, runs function, and ends session', async () => {
    const result = await protect(
      { metadata: { task: 'test' } },
      async (sess) => {
        expect(sess).toBeInstanceOf(SessionInstance);
        expect(sess.status).toBe(SessionStatus.ACTIVE);
        return 'protected result';
      },
    );

    expect(result).toBe('protected result');
  });

  test('protect() ends session on error', async () => {
    await expect(
      protect({}, async () => {
        throw new Error('protect error');
      }),
    ).rejects.toThrow('protect error');
  });
});

// ─── Healing Engine ─────────────────────────────────────────────────────────

describe('Healing Engine', () => {
  test('loop detection triggers after maxRepeats', () => {
    const engine = new HealingEngine({
      enabled: true,
      loopDetection: { enabled: true, maxRepeats: 3, windowSize: 10 },
    });

    const sessionId = 'test-session';

    // First two repeats should not trigger
    expect(engine.checkLoop('same output', sessionId)).toBeNull();
    expect(engine.checkLoop('same output', sessionId)).toBeNull();

    // Third repeat should trigger
    const event = engine.checkLoop('same output', sessionId);
    expect(event).not.toBeNull();
    expect(event?.type).toBe('loop_detection');
    expect(event?.intervention.action).toBe('modify_input');
  });

  test('loop detection does not trigger for varied outputs', () => {
    const engine = new HealingEngine({
      enabled: true,
      loopDetection: { enabled: true, maxRepeats: 3, windowSize: 10 },
    });

    const sessionId = 'test-session';

    expect(engine.checkLoop('output-1', sessionId)).toBeNull();
    expect(engine.checkLoop('output-2', sessionId)).toBeNull();
    expect(engine.checkLoop('output-3', sessionId)).toBeNull();
    expect(engine.checkLoop('output-4', sessionId)).toBeNull();
  });

  test('cost breaker triggers on high span cost', () => {
    const engine = new HealingEngine({
      enabled: true,
      costBreaker: { enabled: true, maxCostPerSession: 10.0, maxCostPerSpan: 2.0 },
    });

    // Within limits
    expect(engine.checkCost(1.5, 'sess-1', 'span-1')).toBeNull();

    // Exceeds per-span limit
    const event = engine.checkCost(3.0, 'sess-1', 'span-2');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('cost_breaker');
    expect(event?.intervention.action).toBe('abort');
  });

  test('cost breaker triggers on high session cost', () => {
    const engine = new HealingEngine({
      enabled: true,
      costBreaker: { enabled: true, maxCostPerSession: 5.0, maxCostPerSpan: 10.0 },
    });

    // Accumulate cost
    expect(engine.checkCost(2.0, 'sess-1')).toBeNull();
    expect(engine.checkCost(2.0, 'sess-1')).toBeNull();

    // This pushes over the limit
    const event = engine.checkCost(2.0, 'sess-1');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('cost_breaker');
  });

  test('hallucination catch triggers on low confidence', () => {
    const engine = new HealingEngine({
      enabled: true,
      hallucinationCatch: { enabled: true, confidenceThreshold: 0.7 },
    });

    // High confidence — no trigger
    expect(engine.checkHallucination(0.9, 'sess-1')).toBeNull();

    // Low confidence — triggers
    const event = engine.checkHallucination(0.3, 'sess-1', 'span-1');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('hallucination_catch');
    expect(event?.intervention.action).toBe('retry');
  });

  test('timeout recovery triggers on long duration', () => {
    const engine = new HealingEngine({
      enabled: true,
      timeoutRecovery: { enabled: true, maxDurationMs: 5000 },
    });

    // Within limits
    expect(engine.checkTimeout(3000, 'sess-1')).toBeNull();

    // Exceeds limit
    const event = engine.checkTimeout(8000, 'sess-1', 'span-1');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('timeout_recovery');
    expect(event?.intervention.action).toBe('fallback');
  });

  test('context overflow with truncate strategy', () => {
    const engine = new HealingEngine({
      enabled: true,
      contextOverflow: { enabled: true, maxTokens: 4000, strategy: 'truncate' },
    });

    // Within limits
    expect(engine.checkContextOverflow(3000, 'sess-1')).toBeNull();

    // Exceeds limit
    const event = engine.checkContextOverflow(5000, 'sess-1', 'span-1');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('context_overflow');
    expect(event?.intervention.action).toBe('modify_input');
  });

  test('context overflow with fail strategy', () => {
    const engine = new HealingEngine({
      enabled: true,
      contextOverflow: { enabled: true, maxTokens: 4000, strategy: 'fail' },
    });

    const event = engine.checkContextOverflow(5000, 'sess-1');
    expect(event).not.toBeNull();
    expect(event?.intervention.action).toBe('abort');
  });

  test('healing engine disabled skips all checks', () => {
    const engine = new HealingEngine({ enabled: false });

    expect(engine.checkLoop('output', 'sess-1')).toBeNull();
    expect(engine.checkCost(100, 'sess-1')).toBeNull();
    expect(engine.checkHallucination(0.1, 'sess-1')).toBeNull();
    expect(engine.checkTimeout(99999, 'sess-1')).toBeNull();
    expect(engine.checkContextOverflow(999999, 'sess-1')).toBeNull();
  });

  test('resetSessionCost resets accumulated cost', () => {
    const engine = new HealingEngine({
      enabled: true,
      costBreaker: { enabled: true, maxCostPerSession: 5.0, maxCostPerSpan: 10.0 },
    });

    engine.checkCost(4.0, 'sess-1');
    engine.resetSessionCost();

    // Should not trigger after reset
    expect(engine.checkCost(4.0, 'sess-1')).toBeNull();
  });
});

// ─── Type Exports ───────────────────────────────────────────────────────────

describe('Type Exports', () => {
  test('enums are accessible', () => {
    expect(SpanType.LLM).toBe('llm_call');
    expect(SpanType.TOOL).toBe('tool_call');
    expect(SpanType.RETRIEVAL).toBe('retrieval');
    expect(SpanType.CHAIN).toBe('chain');
    expect(SpanType.AGENT).toBe('agent');
    expect(SpanType.CUSTOM).toBe('custom');

    expect(SessionStatus.ACTIVE).toBe('active');
    expect(SessionStatus.COMPLETED).toBe('completed');
    expect(SessionStatus.FAILED).toBe('failed');
    expect(SessionStatus.TIMEOUT).toBe('timeout');

    expect(SpanStatus.RUNNING).toBe('running');
    expect(SpanStatus.COMPLETED).toBe('completed');
    expect(SpanStatus.ERROR).toBe('error');
  });

  test('type interfaces are usable', () => {
    // These are compile-time checks — if this test file compiles, types work
    const config: InitConfig = {
      apiKey: 'key',
      projectId: 'proj',
    };

    const sessionConfig: SessionConfig = {
      metadata: { a: 1 },
    };

    const healingConfig: HealingConfig = {
      enabled: true,
    };

    const traceOpts: TraceOptions = {
      name: 'test',
      type: SpanType.LLM,
      captureInput: true,
      captureOutput: true,
    };

    // If we get here without type errors, all types are correctly exported
    expect(config.apiKey).toBe('key');
    expect(sessionConfig.metadata?.a).toBe(1);
    expect(healingConfig.enabled).toBe(true);
    expect(traceOpts.name).toBe('test');
  });
});

// ─── Guard Stubs ────────────────────────────────────────────────────────────

describe('Guard Module (stub)', () => {
  test('runGuards always passes', () => {
    const result = runGuards('test input', []);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test('checkGuard always returns null', () => {
    const rule: GuardRule = { name: 'test', enabled: true, action: 'block' };
    const result = checkGuard('test input', rule);
    expect(result).toBeNull();
  });
});

// ─── Cost Module ────────────────────────────────────────────────────────────

describe('Cost Module', () => {
  test('estimateCost calculates for known model', () => {
    const est = estimateCost('gpt-4', 1000, 500);
    expect(est.model).toBe('gpt-4');
    expect(est.promptTokens).toBe(1000);
    expect(est.completionTokens).toBe(500);
    expect(est.totalCost).toBeGreaterThan(0);
    expect(est.totalCost).toBe(est.promptCost + est.completionCost);
  });

  test('estimateCost returns zero for unknown model', () => {
    const est = estimateCost('unknown-model', 1000, 500);
    expect(est.totalCost).toBe(0);
  });

  test('registerModelPricing adds custom pricing', () => {
    registerModelPricing({
      model: 'custom-model',
      promptPricePerToken: 0.001,
      completionPricePerToken: 0.002,
    });

    const est = estimateCost('custom-model', 100, 50);
    expect(est.promptCost).toBeCloseTo(0.1);
    expect(est.completionCost).toBeCloseTo(0.1);
  });

  test('getModelPricings returns all pricings', () => {
    const pricings = getModelPricings();
    expect(pricings['gpt-4']).toBeDefined();
    expect(pricings['gpt-3.5-turbo']).toBeDefined();
  });
});

// ─── Shutdown ───────────────────────────────────────────────────────────────

describe('Shutdown', () => {
  test('shutdown clears global state', async () => {
    init(TEST_CONFIG);
    session();
    await shutdown();

    // After shutdown, session() should throw
    expect(() => session()).toThrow('AgentStack SDK not initialized');
  });
});
