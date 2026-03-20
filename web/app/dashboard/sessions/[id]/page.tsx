"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Session, Span } from "@/lib/types";

// --- Mock Data ---
const mockSession: Session = {
  id: "ses_a1b2c3d4",
  org_id: "org_1",
  agent_name: "Research Agent",
  agent_id: "agent_1",
  status: "completed",
  input: "Find papers on transformer architectures published in 2024",
  output: "Found 12 relevant papers on transformer architectures...",
  error: "",
  metadata: { framework: "crewai" },
  total_tokens: 8420,
  total_cost_cents: 15,
  total_spans: 5,
  duration_ms: 4200,
  has_healing: false,
  tags: ["research"],
  started_at: "2025-03-20T10:00:00Z",
  ended_at: "2025-03-20T10:00:04Z",
  created_at: "2025-03-20T10:00:00Z",
};

const mockSpans: Span[] = [
  {
    id: "span_001",
    session_id: "ses_a1b2c3d4",
    parent_id: "",
    name: "research_agent.run",
    span_type: "agent",
    status: "completed",
    input: "Find papers on transformer architectures",
    output: "Found 12 papers",
    error: "",
    model: "",
    provider: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 8420,
    cost_cents: 15,
    duration_ms: 4200,
    metadata: {},
    started_at: "2025-03-20T10:00:00.000Z",
    ended_at: "2025-03-20T10:00:04.200Z",
  },
  {
    id: "span_002",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_001",
    name: "plan_search_strategy",
    span_type: "llm_call",
    status: "completed",
    input: "Plan the search strategy for finding papers",
    output: "I will search across arxiv, semantic scholar...",
    error: "",
    model: "gpt-4o",
    provider: "openai",
    input_tokens: 420,
    output_tokens: 380,
    total_tokens: 800,
    cost_cents: 3,
    duration_ms: 1100,
    metadata: {},
    started_at: "2025-03-20T10:00:00.100Z",
    ended_at: "2025-03-20T10:00:01.200Z",
  },
  {
    id: "span_003",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_001",
    name: "search_arxiv",
    span_type: "tool_call",
    status: "completed",
    input: '{"query": "transformer architectures 2024"}',
    output: '{"results": 8}',
    error: "",
    model: "",
    provider: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_cents: 0,
    duration_ms: 800,
    metadata: {},
    started_at: "2025-03-20T10:00:01.300Z",
    ended_at: "2025-03-20T10:00:02.100Z",
  },
  {
    id: "span_004",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_001",
    name: "search_semantic_scholar",
    span_type: "tool_call",
    status: "completed",
    input: '{"query": "transformer architectures 2024"}',
    output: '{"results": 6}',
    error: "",
    model: "",
    provider: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_cents: 0,
    duration_ms: 650,
    metadata: {},
    started_at: "2025-03-20T10:00:01.300Z",
    ended_at: "2025-03-20T10:00:01.950Z",
  },
  {
    id: "span_005",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_001",
    name: "retrieve_paper_details",
    span_type: "retrieval",
    status: "completed",
    input: "Fetch details for 14 papers",
    output: "Retrieved 12 valid papers with abstracts",
    error: "",
    model: "",
    provider: "",
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_cents: 0,
    duration_ms: 400,
    metadata: {},
    started_at: "2025-03-20T10:00:02.200Z",
    ended_at: "2025-03-20T10:00:02.600Z",
  },
  {
    id: "span_006",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_001",
    name: "synthesize_results",
    span_type: "llm_call",
    status: "completed",
    input: "Summarize and rank the 12 papers found",
    output: "Here are the top papers on transformer architectures in 2024...",
    error: "",
    model: "gpt-4o",
    provider: "openai",
    input_tokens: 3200,
    output_tokens: 1800,
    total_tokens: 5000,
    cost_cents: 10,
    duration_ms: 1400,
    metadata: {},
    started_at: "2025-03-20T10:00:02.700Z",
    ended_at: "2025-03-20T10:00:04.100Z",
  },
  {
    id: "span_007",
    session_id: "ses_a1b2c3d4",
    parent_id: "span_006",
    name: "format_citations",
    span_type: "chain",
    status: "completed",
    input: "Format citations for 12 papers",
    output: "Citations formatted in APA style",
    error: "",
    model: "",
    provider: "",
    input_tokens: 420,
    output_tokens: 200,
    total_tokens: 620,
    cost_cents: 2,
    duration_ms: 300,
    metadata: {},
    started_at: "2025-03-20T10:00:03.700Z",
    ended_at: "2025-03-20T10:00:04.000Z",
  },
];

const mockEvents = [
  {
    id: "evt_1",
    type: "session_start",
    message: "Session started for Research Agent",
    timestamp: "2025-03-20T10:00:00.000Z",
  },
  {
    id: "evt_2",
    type: "span_start",
    message: "Agent span research_agent.run started",
    timestamp: "2025-03-20T10:00:00.050Z",
  },
  {
    id: "evt_3",
    type: "llm_request",
    message: "LLM call to gpt-4o (plan_search_strategy)",
    timestamp: "2025-03-20T10:00:00.100Z",
  },
  {
    id: "evt_4",
    type: "tool_invocation",
    message: "Tool calls: search_arxiv, search_semantic_scholar (parallel)",
    timestamp: "2025-03-20T10:00:01.300Z",
  },
  {
    id: "evt_5",
    type: "retrieval",
    message: "Retrieved 12 paper details from database",
    timestamp: "2025-03-20T10:00:02.200Z",
  },
  {
    id: "evt_6",
    type: "llm_request",
    message: "LLM call to gpt-4o (synthesize_results)",
    timestamp: "2025-03-20T10:00:02.700Z",
  },
  {
    id: "evt_7",
    type: "session_end",
    message: "Session completed successfully (4.2s)",
    timestamp: "2025-03-20T10:00:04.200Z",
  },
];

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const session = mockSession;
  const maxDuration = session.duration_ms;

  // Order spans by start time
  const orderedSpans = [...mockSpans].sort(
    (a, b) =>
      new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
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

      {!loading && (
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

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {orderedSpans.map((span) => {
                const depth = getDepth(span, orderedSpans);
                const SpanTypeIcon = spanTypeIcons[span.span_type] || Zap;
                const StatusIcon = spanStatusIcons[span.status] || CheckCircle2;
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
          </div>

          {/* Events Timeline */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">Events</h3>
            </div>
            <div className="p-5">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border-subtle)]" />

                <div className="space-y-4">
                  {mockEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 relative">
                      <div className="w-[15px] h-[15px] rounded-full border-2 border-[var(--border-default)] bg-[var(--bg-elevated)] flex-shrink-0 mt-0.5 z-10" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text-secondary)]">
                          {event.message}
                        </p>
                        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 font-mono">
                          {formatTimestamp(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
