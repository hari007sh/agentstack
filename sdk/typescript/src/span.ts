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

    // Serialize input/output to strings for the backend
    const inputStr = this.data.input != null
      ? (typeof this.data.input === 'string' ? this.data.input : JSON.stringify(this.data.input))
      : '';
    const outputStr = this.data.output != null
      ? (typeof this.data.output === 'string' ? this.data.output : JSON.stringify(this.data.output))
      : '';
    const errorStr = this.data.error
      ? (this.data.error.message || '')
      : '';

    // Emit a typed span payload to the backend
    this.client.addSpan({
      id: this.data.id,
      session_id: this.data.sessionId,
      parent_id: this.data.parentSpanId || '',
      name: this.data.name,
      span_type: this.data.type,
      status: this.data.status,
      input: inputStr,
      output: outputStr,
      error: errorStr,
      model: this.data.model || '',
      input_tokens: this.data.tokens?.prompt ?? 0,
      output_tokens: this.data.tokens?.completion ?? 0,
      total_tokens: this.data.tokens?.total ?? 0,
      duration_ms: this.data.durationMs,
      metadata: this.data.metadata ? JSON.stringify(this.data.metadata) : '{}',
      started_at: this.data.startedAt,
      ended_at: this.data.endedAt,
    });

    // Also emit a legacy span.end event for backward compatibility
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
