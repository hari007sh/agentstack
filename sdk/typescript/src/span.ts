import { randomUUID } from 'crypto';
import {
  Span as SpanData,
  SpanType,
  SpanStatus,
  SpanError,
  TokenUsage,
} from './types';
import { AgentStackClient } from './client';

export class SpanInstance {
  private data: SpanData;
  private client: AgentStackClient;
  private children: SpanInstance[] = [];
  private startTime: number;

  constructor(
    client: AgentStackClient,
    name: string,
    sessionId: string,
    type: SpanType = SpanType.CUSTOM,
    parentSpanId?: string,
    metadata?: Record<string, unknown>,
  ) {
    this.client = client;
    this.startTime = Date.now();

    this.data = {
      id: randomUUID(),
      sessionId,
      parentSpanId,
      name,
      type,
      status: SpanStatus.RUNNING,
      startedAt: new Date().toISOString(),
      metadata,
    };
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  get id(): string {
    return this.data.id;
  }

  get sessionId(): string {
    return this.data.sessionId;
  }

  get name(): string {
    return this.data.name;
  }

  get type(): SpanType {
    return this.data.type;
  }

  get status(): SpanStatus {
    return this.data.status;
  }

  get durationMs(): number | undefined {
    return this.data.durationMs;
  }

  get parentSpanId(): string | undefined {
    return this.data.parentSpanId;
  }

  // ── Setters ─────────────────────────────────────────────────────────────

  setInput(input: unknown): SpanInstance {
    this.data.input = input;
    return this;
  }

  setOutput(output: unknown): SpanInstance {
    this.data.output = output;
    return this;
  }

  setError(error: Error | string): SpanInstance {
    const spanError: SpanError =
      error instanceof Error
        ? { message: error.message, type: error.name, stack: error.stack }
        : { message: error };

    this.data.error = spanError;
    this.data.status = SpanStatus.ERROR;
    return this;
  }

  setTokens(prompt: number, completion: number): SpanInstance {
    const usage: TokenUsage = {
      prompt,
      completion,
      total: prompt + completion,
    };
    this.data.tokens = usage;
    return this;
  }

  setModel(model: string): SpanInstance {
    this.data.model = model;
    return this;
  }

  setMetadata(metadata: Record<string, unknown>): SpanInstance {
    this.data.metadata = { ...this.data.metadata, ...metadata };
    return this;
  }

  // ── Nested spans ────────────────────────────────────────────────────────

  createChildSpan(
    name: string,
    type: SpanType = SpanType.CUSTOM,
    metadata?: Record<string, unknown>,
  ): SpanInstance {
    const child = new SpanInstance(
      this.client,
      name,
      this.data.sessionId,
      type,
      this.data.id,
      metadata,
    );
    this.children.push(child);
    return child;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  end(): SpanData {
    if (this.data.status === SpanStatus.RUNNING) {
      this.data.status = SpanStatus.COMPLETED;
    }

    this.data.endedAt = new Date().toISOString();
    this.data.durationMs = Date.now() - this.startTime;

    // Emit an event for this span
    this.client.addEvent({
      id: randomUUID(),
      sessionId: this.data.sessionId,
      spanId: this.data.id,
      type: 'span.end',
      timestamp: this.data.endedAt,
      data: this.toJSON() as unknown as Record<string, unknown>,
    });

    return this.toJSON();
  }

  toJSON(): SpanData {
    return { ...this.data };
  }
}
