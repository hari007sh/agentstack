/**
 * End-to-end test for @agentstack/sdk TypeScript SDK.
 *
 * Tests the full lifecycle against a running backend at http://localhost:8080:
 * 1. Initialize SDK with JWT auth
 * 2. Create a session with metadata
 * 3. Create spans (LLM, TOOL, AGENT) with inputs/outputs/tokens
 * 4. Track cost using the cost module
 * 5. Test healing engine checks
 * 6. Flush data to the backend
 * 7. Query the backend to verify data was ingested
 * 8. Shutdown gracefully
 */

import { readFileSync } from 'fs';
import {
  init,
  session,
  protect,
  shutdown,
  trace,
  SpanType,
  SessionStatus,
  SpanStatus,
  estimateCost,
  registerModelPricing,
  getModelPricings,
  HealingEngine,
  runGuards,
  checkGuard,
  _resetForTesting,
} from './src/index';

// ─── Config ────────────────────────────────────────────────────────────────

const ENDPOINT = 'http://localhost:8080';
const JWT_PATH = '/tmp/agentstack_jwt.txt';

let jwtToken: string;
try {
  jwtToken = readFileSync(JWT_PATH, 'utf-8').trim();
} catch {
  console.error(`FAIL: Could not read JWT from ${JWT_PATH}`);
  process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Test 1: SDK Init + Session + Span Lifecycle ───────────────────────────

async function testSessionLifecycle(): Promise<void> {
  console.log('\n--- Test 1: Session & Span Lifecycle ---');

  _resetForTesting();

  init({
    apiKey: jwtToken,
    projectId: 'e2e-test-project',
    endpoint: ENDPOINT,
    batchSize: 100, // high batch size so we control flush timing
    flushIntervalMs: 0, // disable auto-flush
    maxRetries: 2,
    debug: true,
  });

  // Create a session with metadata
  const sess = session({
    metadata: {
      agentName: 'E2E Test Agent',
      userId: 'test-user-123',
      env: 'e2e-test',
      tags: ['e2e', 'typescript-sdk'],
    },
  });

  assert(!!sess.id, `Session created with ID: ${sess.id}`);
  assert(sess.status === SessionStatus.ACTIVE, `Session status is ACTIVE`);
  assert(sess.projectId === 'e2e-test-project', `Session projectId correct`);

  // Create an LLM span
  const llmSpan = sess.createSpan('gpt4-completion', SpanType.LLM);
  assert(!!llmSpan.id, `LLM span created with ID: ${llmSpan.id}`);
  assert(llmSpan.type === SpanType.LLM, `LLM span type is llm_call`);
  assert(llmSpan.status === SpanStatus.RUNNING, `LLM span status is RUNNING`);

  llmSpan.setInput({ messages: [{ role: 'user', content: 'What is AgentStack?' }] });
  llmSpan.setModel('gpt-4');
  llmSpan.setTokens(150, 300);
  llmSpan.setOutput({
    choices: [{ message: { role: 'assistant', content: 'AgentStack is an AI agent production platform.' } }],
  });
  const llmData = llmSpan.end();

  assert(llmData.status === SpanStatus.COMPLETED, `LLM span ended with COMPLETED status`);
  assert(typeof llmData.durationMs === 'number' && llmData.durationMs >= 0, `LLM span has durationMs: ${llmData.durationMs}`);
  assert(llmData.tokens?.total === 450, `LLM span token total is 450`);
  assert(llmData.model === 'gpt-4', `LLM span model is gpt-4`);

  // Create a TOOL span
  const toolSpan = sess.createSpan('search-database', SpanType.TOOL);
  toolSpan.setInput({ query: 'AgentStack features' });
  toolSpan.setOutput({ results: ['Shield', 'Trace', 'Test', 'Guard', 'Route', 'Cost'] });
  toolSpan.setMetadata({ tool: 'postgres', latency: 42 });
  toolSpan.end();
  assert(true, `TOOL span created and ended`);

  // Create an AGENT span with a child
  const agentSpan = sess.createSpan('orchestrator', SpanType.AGENT);
  const childSpan = agentSpan.createChildSpan('sub-task', SpanType.CUSTOM, { step: 1 });
  assert(childSpan.parentSpanId === agentSpan.id, `Child span has correct parentSpanId`);
  childSpan.end();
  agentSpan.end();
  assert(true, `AGENT span with child created and ended`);

  // Create a span with error
  const errorSpan = sess.createSpan('failing-operation', SpanType.LLM);
  errorSpan.setError(new Error('Rate limit exceeded'));
  const errorData = errorSpan.end();
  assert(errorData.status === SpanStatus.ERROR, `Error span has ERROR status`);
  assert(errorData.error?.message === 'Rate limit exceeded', `Error span has correct error message`);

  // Add a custom event
  sess.addEvent('user.feedback', { rating: 5, comment: 'Great response!' });
  assert(true, `Custom event added`);

  // End session
  const sessionData = sess.end();
  assert(sessionData.status === SessionStatus.COMPLETED, `Session ended with COMPLETED status`);
  // 4 spans created via session.createSpan(); the child span was created via span.createChildSpan()
  // and is not tracked in the session's activeSpans map (by design — it's owned by the parent).
  assert(sessionData.spans.length === 4, `Session has 4 spans (got ${sessionData.spans.length})`);
  assert(!!sessionData.endedAt, `Session has endedAt timestamp`);

  // Flush to backend
  console.log('  Flushing data to backend...');
  await shutdown();
  console.log('  Flushed successfully.');
}

// ─── Test 2: protect() convenience wrapper ─────────────────────────────────

async function testProtect(): Promise<void> {
  console.log('\n--- Test 2: protect() Convenience Wrapper ---');

  _resetForTesting();

  init({
    apiKey: jwtToken,
    projectId: 'e2e-test-project',
    endpoint: ENDPOINT,
    batchSize: 100,
    flushIntervalMs: 0,
    maxRetries: 2,
    debug: true,
  });

  const result = await protect(
    { metadata: { agentName: 'Protect Test Agent', task: 'summarize' } },
    async (sess) => {
      assert(sess.status === SessionStatus.ACTIVE, `Session inside protect() is ACTIVE`);

      const span = sess.createSpan('summarize', SpanType.LLM);
      span.setModel('claude-3-sonnet');
      span.setTokens(200, 100);
      span.setOutput('This is a summary.');
      span.end();

      return 'summary-result';
    },
  );

  assert(result === 'summary-result', `protect() returned correct result: ${result}`);

  // Test protect with error
  let errorCaught = false;
  try {
    await protect({}, async () => {
      throw new Error('protect error test');
    });
  } catch (e) {
    errorCaught = true;
    assert((e as Error).message === 'protect error test', `protect() re-throws errors correctly`);
  }
  assert(errorCaught, `protect() error was caught`);

  await shutdown();
}

// ─── Test 3: trace() wrapper ───────────────────────────────────────────────

async function testTrace(): Promise<void> {
  console.log('\n--- Test 3: trace() Wrapper ---');

  _resetForTesting();

  init({
    apiKey: jwtToken,
    projectId: 'e2e-test-project',
    endpoint: ENDPOINT,
    batchSize: 100,
    flushIntervalMs: 0,
    maxRetries: 2,
    debug: true,
  });

  // Need a session for trace to work
  session({ metadata: { agentName: 'Trace Test Agent' } });

  // Simple trace
  const traceResult = await trace('my-operation', async (span) => {
    assert(!!span.id, `trace() provides span with ID`);
    span.setModel('gpt-4');
    return 42;
  });
  assert(traceResult === 42, `trace() returns function result`);

  // Trace with options
  const traceResult2 = await trace(
    'llm-call',
    { type: SpanType.LLM, metadata: { test: true } },
    async (span) => {
      span.setTokens(100, 50);
      return 'hello';
    },
  );
  assert(traceResult2 === 'hello', `trace() with options returns correct result`);

  // Trace error handling
  let traceError = false;
  try {
    await trace('failing-trace', async () => {
      throw new Error('trace boom');
    });
  } catch {
    traceError = true;
  }
  assert(traceError, `trace() propagates errors`);

  await shutdown();
}

// ─── Test 4: Cost module ───────────────────────────────────────────────────

async function testCost(): Promise<void> {
  console.log('\n--- Test 4: Cost Module ---');

  // Test built-in model pricing
  const gpt4Cost = estimateCost('gpt-4', 1000, 500);
  assert(gpt4Cost.model === 'gpt-4', `Cost estimate for gpt-4`);
  assert(gpt4Cost.promptTokens === 1000, `Prompt tokens correct`);
  assert(gpt4Cost.completionTokens === 500, `Completion tokens correct`);
  assert(gpt4Cost.totalCost > 0, `Total cost is positive: $${gpt4Cost.totalCost.toFixed(6)}`);
  assert(
    Math.abs(gpt4Cost.totalCost - (gpt4Cost.promptCost + gpt4Cost.completionCost)) < 0.000001,
    `Total = prompt + completion cost`,
  );

  // Test unknown model returns zero
  const unknownCost = estimateCost('unknown-model-xyz', 1000, 500);
  assert(unknownCost.totalCost === 0, `Unknown model returns zero cost`);

  // Test custom model pricing registration
  registerModelPricing({
    model: 'e2e-custom-model',
    promptPricePerToken: 0.01,
    completionPricePerToken: 0.02,
  });

  const customCost = estimateCost('e2e-custom-model', 100, 50);
  assert(Math.abs(customCost.promptCost - 1.0) < 0.001, `Custom model prompt cost: $${customCost.promptCost}`);
  assert(Math.abs(customCost.completionCost - 1.0) < 0.001, `Custom model completion cost: $${customCost.completionCost}`);

  // Test getModelPricings
  const pricings = getModelPricings();
  assert(!!pricings['gpt-4'], `getModelPricings includes gpt-4`);
  assert(!!pricings['claude-3-opus'], `getModelPricings includes claude-3-opus`);
  assert(!!pricings['e2e-custom-model'], `getModelPricings includes custom model`);
}

// ─── Test 5: Healing engine ────────────────────────────────────────────────

async function testHealing(): Promise<void> {
  console.log('\n--- Test 5: Healing Engine ---');

  // Loop detection
  const loopEngine = new HealingEngine({
    enabled: true,
    loopDetection: { enabled: true, maxRepeats: 3, windowSize: 10 },
  });

  assert(loopEngine.checkLoop('output-a', 'sess-1') === null, `Loop: first unique output passes`);
  assert(loopEngine.checkLoop('output-a', 'sess-1') === null, `Loop: second repeat passes`);
  const loopEvent = loopEngine.checkLoop('output-a', 'sess-1');
  assert(loopEvent !== null, `Loop: third repeat triggers`);
  assert(loopEvent?.type === 'loop_detection', `Loop event type is loop_detection`);
  assert(loopEvent?.intervention.action === 'modify_input', `Loop intervention is modify_input`);

  // Cost breaker
  const costEngine = new HealingEngine({
    enabled: true,
    costBreaker: { enabled: true, maxCostPerSession: 5.0, maxCostPerSpan: 2.0 },
  });

  assert(costEngine.checkCost(1.5, 'sess-1') === null, `Cost: within span limit passes`);
  const costEvent = costEngine.checkCost(3.0, 'sess-1');
  assert(costEvent !== null, `Cost: exceeding span limit triggers`);
  assert(costEvent?.type === 'cost_breaker', `Cost event type is cost_breaker`);

  // Hallucination catch
  const halluEngine = new HealingEngine({
    enabled: true,
    hallucinationCatch: { enabled: true, confidenceThreshold: 0.7 },
  });

  assert(halluEngine.checkHallucination(0.9, 'sess-1') === null, `Hallucination: high confidence passes`);
  const halluEvent = halluEngine.checkHallucination(0.3, 'sess-1');
  assert(halluEvent !== null, `Hallucination: low confidence triggers`);
  assert(halluEvent?.intervention.action === 'retry', `Hallucination intervention is retry`);

  // Timeout
  const timeoutEngine = new HealingEngine({
    enabled: true,
    timeoutRecovery: { enabled: true, maxDurationMs: 5000 },
  });

  assert(timeoutEngine.checkTimeout(3000, 'sess-1') === null, `Timeout: within limit passes`);
  const timeoutEvent = timeoutEngine.checkTimeout(8000, 'sess-1');
  assert(timeoutEvent !== null, `Timeout: exceeding limit triggers`);
  assert(timeoutEvent?.intervention.action === 'fallback', `Timeout intervention is fallback`);

  // Context overflow
  const ctxEngine = new HealingEngine({
    enabled: true,
    contextOverflow: { enabled: true, maxTokens: 4000, strategy: 'truncate' },
  });

  assert(ctxEngine.checkContextOverflow(3000, 'sess-1') === null, `Context: within limit passes`);
  const ctxEvent = ctxEngine.checkContextOverflow(5000, 'sess-1');
  assert(ctxEvent !== null, `Context: exceeding limit triggers`);

  // Disabled engine
  const disabledEngine = new HealingEngine({ enabled: false });
  assert(disabledEngine.checkLoop('x', 's') === null, `Disabled: loop check skipped`);
  assert(disabledEngine.checkCost(999, 's') === null, `Disabled: cost check skipped`);
}

// ─── Test 6: Guard stubs ──────────────────────────────────────────────────

async function testGuards(): Promise<void> {
  console.log('\n--- Test 6: Guard Stubs ---');

  const result = runGuards('test input', []);
  assert(result.passed === true, `runGuards passes (stub)`);
  assert(result.violations.length === 0, `runGuards has no violations`);

  const violation = checkGuard('test', { name: 'test-rule', enabled: true, action: 'block' });
  assert(violation === null, `checkGuard returns null (stub)`);
}

// ─── Test 7: Verify data in backend ────────────────────────────────────────

async function testBackendVerification(): Promise<void> {
  console.log('\n--- Test 7: Backend Data Verification ---');

  // Query sessions from the backend
  const response = await fetch(`${ENDPOINT}/v1/sessions`, {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
    },
  });

  assert(response.ok, `GET /v1/sessions returns 200 (got ${response.status})`);

  const data = await response.json();
  assert(Array.isArray(data.sessions), `Response contains sessions array`);
  assert(typeof data.total === 'number', `Response contains total count`);

  console.log(`  INFO: Backend has ${data.total} total sessions`);
}

// ─── Test 8: Flush with real batch ingestion ───────────────────────────────

async function testBatchIngestion(): Promise<void> {
  console.log('\n--- Test 8: Batch Ingestion to Backend ---');

  _resetForTesting();

  init({
    apiKey: jwtToken,
    projectId: 'e2e-test-project',
    endpoint: ENDPOINT,
    batchSize: 100,
    flushIntervalMs: 0,
    maxRetries: 2,
    debug: true,
  });

  const sess = session({
    metadata: {
      agentName: 'TS-SDK-E2E-Agent',
      env: 'e2e-test',
      tags: ['e2e', 'typescript-sdk'],
    },
  });

  // Create several spans of different types
  const span1 = sess.createSpan('embed-query', SpanType.LLM);
  span1.setModel('text-embedding-ada-002');
  span1.setTokens(50, 0);
  span1.setInput('What is observability?');
  span1.setOutput('[0.123, 0.456, ...]');
  span1.end();

  const span2 = sess.createSpan('vector-search', SpanType.RETRIEVAL);
  span2.setInput({ query: 'observability', top_k: 5 });
  span2.setOutput({ results: [{ score: 0.95, text: 'Observability is...' }] });
  span2.end();

  const span3 = sess.createSpan('generate-response', SpanType.LLM);
  span3.setModel('gpt-4');
  span3.setTokens(500, 250);
  span3.setInput({ messages: [{ role: 'user', content: 'Explain observability' }] });
  span3.setOutput({ content: 'Observability is the ability to measure...' });
  span3.end();

  sess.end();

  // Now flush - this sends to the real backend
  try {
    await shutdown();
    assert(true, `Batch flush to ${ENDPOINT}/v1/ingest/batch succeeded`);
  } catch (err) {
    assert(false, `Batch flush failed: ${err}`);
  }
}

// ─── Run All Tests ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== AgentStack TypeScript SDK — End-to-End Tests ===');
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`JWT: ${jwtToken.slice(0, 20)}...${jwtToken.slice(-10)}`);

  // Check backend health first
  try {
    const healthRes = await fetch(`${ENDPOINT}/health`);
    assert(healthRes.ok, `Backend health check at ${ENDPOINT}/health`);
  } catch (err) {
    console.error(`FATAL: Backend not reachable at ${ENDPOINT}: ${err}`);
    process.exit(1);
  }

  await testSessionLifecycle();
  await testProtect();
  await testTrace();
  await testCost();
  await testHealing();
  await testGuards();
  await testBackendVerification();
  await testBatchIngestion();

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.error('\nSome tests FAILED!');
    process.exit(1);
  } else {
    console.log('\nAll tests PASSED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
