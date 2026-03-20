import { Event, HealingEvent } from './types';

// ─── Payload Types ──────────────────────────────────────────────────────────

interface BatchPayload {
  events: Event[];
  healingEvents: HealingEvent[];
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
  private eventBuffer: Event[] = [];
  private healingBuffer: HealingEvent[] = [];
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

  addEvent(event: Event): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  addHealingEvent(event: HealingEvent): void {
    this.healingBuffer.push(event);
    if (this.healingBuffer.length >= this.config.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (this.eventBuffer.length === 0 && this.healingBuffer.length === 0) return;

    this.isFlushing = true;

    const events = this.eventBuffer.splice(0);
    const healingEvents = this.healingBuffer.splice(0);

    const payload: BatchPayload = {
      events,
      healingEvents,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.sendWithRetry(payload);
      this.log(`Flushed ${events.length} events, ${healingEvents.length} healing events`);
    } catch (err) {
      // Put events back in the buffer on failure
      this.eventBuffer.unshift(...events);
      this.healingBuffer.unshift(...healingEvents);
      this.log(`Failed to flush events: ${err}`);
    } finally {
      this.isFlushing = false;
    }
  }

  async shutdown(): Promise<void> {
    this.stopFlushInterval();
    await this.flush();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async sendWithRetry(payload: BatchPayload): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.send(payload);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
        this.log(`Retry ${attempt + 1}/${this.config.maxRetries} in ${backoffMs}ms`);
        await this.sleep(backoffMs);
      }
    }

    throw lastError ?? new Error('Send failed after retries');
  }

  private async send(payload: BatchPayload): Promise<void> {
    const url = `${this.config.endpoint}/v1/ingest`;

    // Use dynamic import for fetch in Node.js < 18, otherwise globalThis.fetch
    const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined;

    if (!fetchFn) {
      this.log('No fetch implementation available — events buffered locally');
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
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  get endpoint(): string {
    return this.config.endpoint;
  }

  get projectId(): string {
    return this.config.projectId;
  }
}
