import { randomUUID } from 'crypto';
import {
  Session as SessionData,
  SessionStatus,
  SessionConfig,
  SpanType,
  Span,
  Event,
} from './types';
import { AgentStackClient } from './client';
import { SpanInstance } from './span';

export class SessionInstance {
  private data: SessionData;
  private client: AgentStackClient;
  private activeSpans: Map<string, SpanInstance> = new Map();
  private completedSpans: Span[] = [];

  constructor(client: AgentStackClient, projectId: string, config?: SessionConfig) {
    this.client = client;

    this.data = {
      id: randomUUID(),
      projectId,
      status: SessionStatus.ACTIVE,
      startedAt: new Date().toISOString(),
      metadata: config?.metadata,
      spans: [],
      events: [],
    };

    // Emit session to the backend via the typed session buffer
    this.client.addSession({
      id: this.data.id,
      agent_name: (config?.metadata?.agentName as string) || 'sdk-session',
      status: 'running',
      input: (config?.metadata?.input as string) || '',
      metadata: config?.metadata ? JSON.stringify(config.metadata) : '{}',
      tags: (config?.metadata?.tags as string[]) || [],
      started_at: this.data.startedAt,
    });

    // Also emit as a legacy event for internal tracking
    this.client.addEvent({
      id: randomUUID(),
      sessionId: this.data.id,
      type: 'session.start',
      timestamp: this.data.startedAt,
      data: {
        projectId: this.data.projectId,
        metadata: this.data.metadata ?? {},
      },
    });
  }

  // ── Getters ─────────────────────────────────────────────────────────────

  get id(): string {
    return this.data.id;
  }

  get status(): SessionStatus {
    return this.data.status;
  }

  get projectId(): string {
    return this.data.projectId;
  }

  // ── Span Management ────────────────────────────────────────────────────

  createSpan(
    name: string,
    type: SpanType = SpanType.CUSTOM,
    parentSpanId?: string,
    metadata?: Record<string, unknown>,
  ): SpanInstance {
    const span = new SpanInstance(this.client, name, this.data.id, type, parentSpanId, metadata);
    this.activeSpans.set(span.id, span);

    // Emit span start event
    this.client.addEvent({
      id: randomUUID(),
      sessionId: this.data.id,
      spanId: span.id,
      type: 'span.start',
      timestamp: new Date().toISOString(),
      data: {
        name: span.name,
        type: span.type,
        parentSpanId: span.parentSpanId,
      },
    });

    return span;
  }

  endSpan(spanId: string): Span | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) return undefined;

    const spanData = span.end();
    this.activeSpans.delete(spanId);
    this.completedSpans.push(spanData);
    return spanData;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start(): SessionInstance {
    this.data.status = SessionStatus.ACTIVE;
    return this;
  }

  end(status: SessionStatus = SessionStatus.COMPLETED): SessionData {
    // End all remaining active spans
    for (const [id] of this.activeSpans) {
      this.endSpan(id);
    }

    this.data.status = status;
    this.data.endedAt = new Date().toISOString();
    this.data.spans = [...this.completedSpans];

    // Compute totals for the session update
    let totalTokens = 0;
    let totalDurationMs = 0;
    for (const span of this.completedSpans) {
      totalTokens += span.tokens?.total ?? 0;
      totalDurationMs += span.durationMs ?? 0;
    }

    // Emit a session update (completed) to the backend
    this.client.addSession({
      id: this.data.id,
      agent_name: (this.data.metadata?.agentName as string) || 'sdk-session',
      status: status === SessionStatus.COMPLETED ? 'completed'
        : status === SessionStatus.FAILED ? 'failed'
        : status === SessionStatus.TIMEOUT ? 'timeout'
        : status,
      total_tokens: totalTokens,
      total_spans: this.completedSpans.length,
      duration_ms: totalDurationMs,
      tags: (this.data.metadata?.tags as string[]) || [],
      started_at: this.data.startedAt,
      ended_at: this.data.endedAt,
    });

    // Emit session end event
    this.client.addEvent({
      id: randomUUID(),
      sessionId: this.data.id,
      type: 'session.end',
      timestamp: this.data.endedAt,
      data: {
        status: this.data.status,
        spanCount: this.completedSpans.length,
      },
    });

    return this.toJSON();
  }

  // ── Events ──────────────────────────────────────────────────────────────

  addEvent(type: string, data: Record<string, unknown>, spanId?: string): void {
    const event: Event = {
      id: randomUUID(),
      sessionId: this.data.id,
      spanId,
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    this.data.events.push(event);
    this.client.addEvent(event);
  }

  // ── Serialization ─────────────────────────────────────────────────────

  toJSON(): SessionData {
    return {
      ...this.data,
      spans: [...this.completedSpans],
    };
  }
}
