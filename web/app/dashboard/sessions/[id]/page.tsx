"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  Coins,
  Hash,
  Bot,
  Cpu,
  Wrench,
  Database,
  Link2,
  Zap,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Timer,
  RefreshCw,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { Session, Span } from "@/lib/types";

// Backend event shape from ClickHouse store
interface SessionEvent {
  id: string;
  session_id: string;
  span_id?: string;
  org_id: string;
  type: string;
  name: string;
  data: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  completed: "var(--accent-green)",
  failed: "var(--accent-red)",
  running: "var(--accent-blue)",
  timeout: "var(--accent-amber)",
  healed: "var(--healing-blue)",
};

const spanTypeIcons: Record<string, React.ElementType> = {
  agent: Bot,
  llm_call: Cpu,
  tool_call: Wrench,
  retrieval: Database,
  chain: Link2,
  custom: Zap,
};

const spanTypeColors: Record<string, string> = {
  agent: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]",
  llm_call: "bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]",
  tool_call: "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]",
  retrieval: "bg-[var(--accent-green)]/10 text-[var(--accent-green)]",
  chain: "bg-[var(--healing-blue)]/10 text-[var(--healing-blue)]",
  custom: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

const spanStatusIcons: Record<string, React.ElementType> = {
  completed: CheckCircle2,
  failed: XCircle,
  running: Timer,
  timeout: AlertCircle,
};

function getDepth(span: Span, allSpans: Span[]): number {
  if (!span.parent_id) return 0;
  const parent = allSpans.find((s) => s.id === span.parent_id);
  if (!parent) return 0;
  return 1 + getDepth(parent, allSpans);
}

function formatDuration(ms: number): string {
  if (ms === 0) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);

  const fetchData = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      if (token) {
        api.setToken(token);
      }

      const [sessionRes, spansRes, eventsRes] = await Promise.all([
        api.get<Session>(`/v1/sessions/${sessionId}`),
        api.get<{ spans: Span[] }>(`/v1/sessions/${sessionId}/spans`),
        api.get<{ events: SessionEvent[] }>(
          `/v1/sessions/${sessionId}/events`
        ),
      ]);

      setSession(sessionRes);
      setSpans(spansRes.spans ?? []);
      setEvents(eventsRes.events ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError("Session not found.");
        } else {
          setError(err.message || "Failed to load session.");
        }
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxDuration = session?.duration_ms ?? 0;

  // Order spans by start time
  const orderedSpans = [...spans].sort(
    (a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  // Order events by timestamp
  const orderedEvents = [...events].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/dashboard/sessions")}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Sessions
      </button>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex gap-4">
              <SkeletonBlock className="h-6 w-32" />
              <SkeletonBlock className="h-6 w-20" />
            </div>
            <div className="flex gap-6 mt-4">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-4 w-24 mb-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 mb-3">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <SkeletonBlock className="h-4 w-48" />
                <div className="flex-1" />
                <SkeletonBlock className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-red)]" />
            <h3 className="text-sm font-medium text-[var(--accent-red)]">
              Failed to load session
            </h3>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && session && (
        <>
          {/* Session Metadata Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <h1 className="text-lg font-semibold font-mono">
                {session.id}
              </h1>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    session.status === "healed"
                      ? "status-healed"
                      : session.status === "failed"
                      ? "status-failed"
                      : session.status === "running"
                      ? "animate-pulse"
                      : ""
                  }`}
                  style={{
                    backgroundColor: statusColors[session.status],
                  }}
                />
                <span className="text-sm capitalize">{session.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Agent
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                  {session.agent_name}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Duration
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  {formatDuration(session.duration_ms)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Cost
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                  {formatCost(session.total_cost_cents)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Tokens
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  {session.total_tokens.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Spans
                </p>
                <p className="text-sm">{session.total_spans}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Started
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {new Date(session.started_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Span Tree */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">Span Timeline</h3>
            </div>

            {orderedSpans.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-3">
                  <Cpu className="w-5 h-5 text-[var(--accent-purple)]" />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  No spans recorded for this session.
                </p>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {orderedSpans.map((span) => {
                  const depth = getDepth(span, orderedSpans);
                  const SpanTypeIcon = spanTypeIcons[span.span_type] || Zap;
                  const StatusIcon =
                    spanStatusIcons[span.status] || CheckCircle2;
                  const barWidth =
                    maxDuration > 0
                      ? Math.max(4, (span.duration_ms / maxDuration) * 100)
                      : 4;

                  return (
                    <motion.div
                      key={span.id}
                      variants={staggerItem}
                      className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      {/* Indentation */}
                      <div
                        style={{ width: depth * 24 }}
                        className="flex-shrink-0"
                      />

                      {/* Type Icon */}
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${spanTypeColors[span.span_type]}`}
                      >
                        <SpanTypeIcon className="w-3.5 h-3.5" />
                      </div>

                      {/* Name + Type Badge */}
                      <div className="min-w-0 flex-shrink-0 w-48">
                        <p className="text-sm font-medium truncate">
                          {span.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-4 border-[var(--border-subtle)]"
                          >
                            {span.span_type.replace("_", " ")}
                          </Badge>
                          {span.model && (
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              {span.model}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
                        <StatusIcon
                          className="w-3.5 h-3.5"
                          style={{
                            color:
                              span.status === "completed"
                                ? "var(--accent-green)"
                                : span.status === "failed"
                                ? "var(--accent-red)"
                                : span.status === "running"
                                ? "var(--accent-blue)"
                                : "var(--accent-amber)",
                          }}
                        />
                        <span className="text-xs capitalize text-[var(--text-secondary)]">
                          {span.status}
                        </span>
                      </div>

                      {/* Duration Bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${barWidth}%`,
                                backgroundColor:
                                  span.span_type === "llm_call"
                                    ? "var(--accent-purple)"
                                    : span.span_type === "tool_call"
                                    ? "var(--accent-amber)"
                                    : span.span_type === "agent"
                                    ? "var(--accent-blue)"
                                    : span.span_type === "retrieval"
                                    ? "var(--accent-green)"
                                    : "var(--healing-blue)",
                              }}
                            />
                          </div>
                          <span className="text-xs text-[var(--text-tertiary)] w-14 text-right flex-shrink-0">
                            {formatDuration(span.duration_ms)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>

          {/* Events Timeline */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">Events</h3>
            </div>

            {orderedEvents.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-3">
                  <Zap className="w-5 h-5 text-[var(--accent-blue)]" />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  No events recorded for this session.
                </p>
              </div>
            ) : (
              <div className="p-5">
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />

                  <div className="space-y-4">
                    {orderedEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 relative"
                      >
                        <div className="w-[15px] h-[15px] rounded-full border-2 border-[var(--border-default)] bg-[var(--bg-elevated)] flex-shrink-0 mt-0.5 z-10" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--text-secondary)]">
                            <span className="text-[var(--text-primary)] font-medium">
                              {event.name || event.type}
                            </span>
                            {event.data && (
                              <span className="ml-2 text-[var(--text-tertiary)]">
                                {event.data}
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 font-mono">
                            {formatTimestamp(event.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
