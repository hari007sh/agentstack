import { Event, HealingEvent } from './types';

// ─── Backend Payload Types ─────────────────────────────────────────────────
// These match the Go backend's service.BatchIngestRequest exactly.

interface SessionPayload {
  id: string;
  agent_name: string;
  agent_id?: string;
  status: string;
  input?: string;
  output?: string;
  error?: string;
  metadata?: string;
  total_tokens?: number;
  total_cost_cents?: number;
  total_spans?: number;
  duration_ms?: number;
  has_healing?: number;
  tags?: string[];
  started_at: string;
  ended_at?: string;
}

interface SpanPayload {
  id: string;
  session_id: string;
  parent_id?: string;
  name: string;
  span_type: string;
  status: string;
  input?: string;
  output?: string;
  error?: string;
  model?: string;
  provider?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost_cents?: number;
  duration_ms?: number;
  metadata?: string;
  started_at: string;
  ended_at?: string;
}

interface EventPayload {
  id: string;
  session_id: string;
  span_id?: string;
  type: string;
  name?: string;
  data?: string;
  created_at: string;
}

interface BatchPayload {
  sessions: SessionPayload[];
  spans: SpanPayload[];
  events: EventPayload[];
}

interface HealingPayload {
  id: string;
  session_id: string;
  span_id?: string;
  type: string;
  trigger: string;
  action: string;
  description: string;
  resolved: boolean;
  timestamp: string;
}

interface ClientConfig {
  apiKey: string;
  projectId: string;
  endpoint: string;
  batchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  debug: boolean;
}

// ─── AgentStackClient ───────────────────────────────────────────────────────

export class AgentStackClient {
  private config: ClientConfig;
  private sessionBuffer: SessionPayload[] = [];
  private spanBuffer: SpanPayload[] = [];
  private eventBuffer: EventPayload[] = [];
  private healingBuffer: HealingPayload[] = [];
  // Legacy event buffer for backward compatibility with internal SDK events
  private legacyEventBuffer: Event[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;

  constructor(config: Partial<ClientConfig> & { apiKey: string; projectId: string }) {
    this.config = {
      endpoint: 'https://api.agentstack.dev',
      batchSize: 50,
      flushIntervalMs: 5000,
      maxRetries: 3,
      debug: false,
      ...config,
    };

    this.startFlushInterval();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Add a session payload for ingestion.
   */
  addSession(session: SessionPayload): void {
    this.sessionBuffer.push(session);
    this.maybeFlush();
  }

  /**
   * Add a span payload for ingestion.
   */
  addSpan(span: SpanPayload): void {
    this.spanBuffer.push(span);
    this.maybeFlush();
  }

  /**
   * Add an event payload for ingestion.
   */
  addEventPayload(event: EventPayload): void {
    this.eventBuffer.push(event);
    this.maybeFlush();
  }

  /**
   * Add an internal Event (legacy format used by session/span lifecycle).
   * These are translated to EventPayload and buffered for batch ingestion.
   */
  addEvent(event: Event): void {
    this.legacyEventBuffer.push(event);

    // Also buffer as a proper EventPayload for the backend
    const payload: EventPayload = {
      id: event.id,
      session_id: event.sessionId,
      span_id: event.spanId,
      type: event.type,
      name: event.type,
      data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
      created_at: event.timestamp,
    };
    this.eventBuffer.push(payload);
    this.maybeFlush();
  }

  /**
   * Add a healing event for ingestion.
   */
  addHealingEvent(event: HealingEvent): void {
    const payload: HealingPayload = {
      id: event.id,
      session_id: event.sessionId,
      span_id: event.spanId,
      type: event.type,
      trigger: event.trigger,
      action: event.intervention.action,
      description: event.intervention.description,
      resolved: event.resolved,
      timestamp: event.timestamp,
    };
    this.healingBuffer.push(payload);
    this.maybeFlush();
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;

    const hasBatchData = this.sessionBuffer.length > 0 || this.spanBuffer.length > 0 || this.eventBuffer.length > 0;
    const hasHealingData = this.healingBuffer.length > 0;

    if (!hasBatchData && !hasHealingData) return;

    this.isFlushing = true;

    // Drain buffers
    const sessions = this.sessionBuffer.splice(0);
    const spans = this.spanBuffer.splice(0);
    const events = this.eventBuffer.splice(0);
    const healingEvents = this.healingBuffer.splice(0);
    this.legacyEventBuffer.splice(0);

    try {
      // Send batch of sessions/spans/events
      if (sessions.length > 0 || spans.length > 0 || events.length > 0) {
        const batchPayload: BatchPayload = { sessions, spans, events };
        await this.sendBatchWithRetry(batchPayload);
        this.log(`Flushed batch: ${sessions.length} sessions, ${spans.length} spans, ${events.length} events`);
      }

      // Send healing events
      if (healingEvents.length > 0) {
        for (const he of healingEvents) {
          await this.sendHealingWithRetry(he);
        }
        this.log(`Flushed ${healingEvents.length} healing events`);
      }
    } catch (err) {
      // Put data back in the buffers on failure
      this.sessionBuffer.unshift(...sessions);
      this.spanBuffer.unshift(...spans);
      this.eventBuffer.unshift(...events);
      this.healingBuffer.unshift(...healingEvents);
      this.log(`Failed to flush: ${err}`);
    } finally {
      this.isFlushing = false;
    }
  }

  async shutdown(): Promise<void> {
    this.stopFlushInterval();
    await this.flush();
  }

  // ── Internal: Batch ────────────────────────────────────────────────────

  private async sendBatchWithRetry(payload: BatchPayload): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.sendJSON(`${this.config.endpoint}/v1/ingest/batch`, payload);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.log(`Retry batch ${attempt + 1}/${this.config.maxRetries} in ${backoffMs}ms`);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error('Batch send failed after retries');
  }

  private async sendHealingWithRetry(payload: HealingPayload): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.sendJSON(`${this.config.endpoint}/v1/ingest/healing`, payload);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.config.maxRetries - 1) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          this.log(`Retry healing ${attempt + 1}/${this.config.maxRetries} in ${backoffMs}ms`);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError ?? new Error('Healing send failed after retries');
  }

  private async sendJSON(url: string, payload: unknown): Promise<void> {
    const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;

    if (!fetchFn) {
      this.log('No fetch implementation available — data buffered locally');
      return;
    }

    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        'X-Project-Id': this.config.projectId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText} — ${body}`);
    }
  }

  // ── Internal: Timers ────────────────────────────────────────────────────

  private maybeFlush(): void {
    const totalPending =
      this.sessionBuffer.length + this.spanBuffer.length + this.eventBuffer.length + this.healingBuffer.length;
    if (totalPending >= this.config.batchSize) {
      void this.flush();
    }
  }

  private startFlushInterval(): void {
    if (this.config.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, this.config.flushIntervalMs);

      // Allow the process to exit even if the timer is running
      if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }

  private stopFlushInterval(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[agentstack] ${message}`);
    }
  }

  // ── Accessors (for testing) ─────────────────────────────────────────────

  get pendingEventCount(): number {
    return this.eventBuffer.length;
  }

  get pendingHealingEventCount(): number {
    return this.healingBuffer.length;
  }

  get pendingSessionCount(): number {
    return this.sessionBuffer.length;
  }

  get pendingSpanCount(): number {
    return this.spanBuffer.length;
  }

  get endpoint(): string {
    return this.config.endpoint;
  }

  get projectId(): string {
    return this.config.projectId;
  }
}
