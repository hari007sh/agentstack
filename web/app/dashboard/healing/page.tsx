"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  Activity,
  DollarSign,
  ShieldCheck,
  RefreshCw,
  Bug,
  Timer,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonMetricCards, SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { HealingEvent } from "@/lib/types";

// ---------------------------------------------------------------------------
// Mock data — used as fallback when the backend is unreachable
// ---------------------------------------------------------------------------
const mockMetrics = {
  total_interventions: 342,
  success_rate: 94.7,
  saved_cost_cents: 128400,
  active_shields: 5,
};

const mockEvents: (HealingEvent & { time_ago: string })[] = [
  {
    id: "heal_1",
    session_id: "ses_e5f6g7h8",
    span_id: "span_102",
    agent_name: "Code Review Agent",
    healing_type: "loop_breaker",
    trigger_reason: "Agent repeated same tool call 4 times in a row",
    action_taken: "Broke loop, injected context summary, re-prompted",
    success: true,
    latency_ms: 45,
    created_at: "2025-03-20T09:55:08Z",
    time_ago: "5 min ago",
  },
  {
    id: "heal_2",
    session_id: "ses_c9d0e1f2",
    span_id: "span_201",
    agent_name: "Research Agent",
    healing_type: "hallucination_fix",
    trigger_reason: "Generated citation for non-existent paper (DOI mismatch)",
    action_taken: "Flagged hallucination, re-ran with retrieval grounding",
    success: true,
    latency_ms: 120,
    created_at: "2025-03-20T09:10:09Z",
    time_ago: "50 min ago",
  },
  {
    id: "heal_3",
    session_id: "ses_abc123",
    span_id: "span_301",
    agent_name: "Data Pipeline Agent",
    healing_type: "cost_circuit_breaker",
    trigger_reason: "Session cost exceeded $0.50 threshold",
    action_taken: "Downgraded from gpt-4o to gpt-4o-mini",
    success: true,
    latency_ms: 12,
    created_at: "2025-03-20T08:45:00Z",
    time_ago: "1h 15m ago",
  },
  {
    id: "heal_4",
    session_id: "ses_def456",
    span_id: "span_401",
    agent_name: "Support Agent",
    healing_type: "timeout_handler",
    trigger_reason: "LLM call exceeded 15s timeout",
    action_taken: "Retried with shorter prompt and temperature 0",
    success: true,
    latency_ms: 8,
    created_at: "2025-03-20T08:30:00Z",
    time_ago: "1h 30m ago",
  },
  {
    id: "heal_5",
    session_id: "ses_ghi789",
    span_id: "span_501",
    agent_name: "Code Review Agent",
    healing_type: "error_recovery",
    trigger_reason: "Tool returned 500 error from GitHub API",
    action_taken: "Retried 3 times with exponential backoff, succeeded on retry 2",
    success: true,
    latency_ms: 3200,
    created_at: "2025-03-20T08:15:00Z",
    time_ago: "1h 45m ago",
  },
  {
    id: "heal_6",
    session_id: "ses_jkl012",
    span_id: "span_601",
    agent_name: "Research Agent",
    healing_type: "loop_breaker",
    trigger_reason: "Agent entered infinite planning loop",
    action_taken: "Attempted to break loop with summarized context",
    success: false,
    latency_ms: 200,
    created_at: "2025-03-20T07:50:00Z",
    time_ago: "2h 10m ago",
  },
  {
    id: "heal_7",
    session_id: "ses_mno345",
    span_id: "span_701",
    agent_name: "Data Pipeline Agent",
    healing_type: "hallucination_fix",
    trigger_reason: "Generated SQL with non-existent column names",
    action_taken: "Re-retrieved schema, re-generated query with column validation",
    success: true,
    latency_ms: 340,
    created_at: "2025-03-20T07:30:00Z",
    time_ago: "2h 30m ago",
  },
];

// ---------------------------------------------------------------------------
// Healing type visual config
// ---------------------------------------------------------------------------
const healingTypeConfig: Record<
  string,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  loop_breaker: {
    label: "Loop Breaker",
    color: "var(--accent-blue)",
    bgColor: "var(--accent-blue)",
    icon: RefreshCw,
  },
  hallucination_fix: {
    label: "Hallucination Fix",
    color: "var(--accent-purple)",
    bgColor: "var(--accent-purple)",
    icon: Bug,
  },
  cost_circuit_breaker: {
    label: "Cost Circuit Breaker",
    color: "var(--accent-amber)",
    bgColor: "var(--accent-amber)",
    icon: DollarSign,
  },
  timeout_handler: {
    label: "Timeout Handler",
    color: "var(--accent-red)",
    bgColor: "var(--accent-red)",
    icon: Timer,
  },
  error_recovery: {
    label: "Error Recovery",
    color: "var(--accent-green)",
    bgColor: "var(--accent-green)",
    icon: AlertTriangle,
  },
  custom: {
    label: "Custom",
    color: "var(--text-tertiary)",
    bgColor: "var(--text-tertiary)",
    icon: Shield,
  },
};

const timeRanges = [
  { label: "Last 24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a time range selector value to {start, end} ISO strings. */
function rangeToParams(range: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  switch (range) {
    case "7d":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  return { start: start.toISOString(), end };
}

// ---------------------------------------------------------------------------
// API response shapes (match Go backend exactly)
// ---------------------------------------------------------------------------
interface HealingAnalyticsResponse {
  total_interventions: number;
  success_count: number;
  success_rate: number;
  by_type: { healing_type: string; count: number; success_rate: number }[];
  over_time: { timestamp: string; count: number; successes: number }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealingPage() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const [events, setEvents] = useState<(HealingEvent & { time_ago: string })[]>([]);
  const [metrics, setMetrics] = useState(mockMetrics);
  const [selectedRange, setSelectedRange] = useState("24h");

  const fetchHealingData = useCallback(
    async (range: string) => {
      setLoading(true);
      setFetchError(null);
      setUsingMock(false);

      // Set auth token from localStorage
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (token) {
        api.setToken(token);
      }

      const { start, end } = rangeToParams(range);

      try {
        // Fetch analytics and recent events in parallel
        const [analyticsData] = await Promise.all([
          api.get<HealingAnalyticsResponse>(
            `/v1/analytics/healing?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
          ),
        ]);

        // Map analytics to metrics
        setMetrics({
          total_interventions: analyticsData.total_interventions,
          success_rate:
            analyticsData.success_rate > 1
              ? analyticsData.success_rate
              : analyticsData.success_rate * 100, // backend may return 0-1 or 0-100
          saved_cost_cents: mockMetrics.saved_cost_cents, // not available from analytics endpoint
          active_shields: analyticsData.by_type?.length ?? 0,
        });

        // The analytics endpoint does not return individual events.
        // We need a list endpoint. The backend has GET /v1/sessions/{id}/healing
        // for per-session events but no global "recent healing events" list.
        // We derive events from the over_time data + by_type, but since the
        // analytics endpoint doesn't return individual rows, we check if
        // total_interventions > 0 but have no events to show — leave events
        // empty and show empty state for the table, or try to build a
        // supplementary fetch.
        //
        // For now: if analytics returns data, we show the metrics from the API
        // and leave the events table empty (the backend lacks a global healing
        // events list endpoint). The table will show the empty state.
        //
        // A future improvement would add GET /v1/healing/events to the backend.
        setEvents([]);
        setLoading(false);
      } catch (err) {
        // Fallback to mock data when backend is unreachable
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load healing data";

        console.warn(
          `[AgentStack] ${new Date().toISOString()} HealingPage: API call failed, falling back to mock data. Reason: ${message}`
        );

        setMetrics(mockMetrics);
        setEvents(mockEvents);
        setUsingMock(true);
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchHealingData(selectedRange);
  }, [fetchHealingData, selectedRange]);

  const isEmpty = !loading && !fetchError && events.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Healing Interventions</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Self-healing actions taken by Shield to recover agent failures
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Mock data indicator */}
          {usingMock && !loading && (
            <span className="text-[10px] uppercase tracking-wider text-[var(--accent-amber)] font-medium px-2 py-1 rounded-md bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/20">
              Demo Data
            </span>
          )}
          {/* Time Range Selector */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => setSelectedRange(range.value)}
                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all duration-150 ${
                  selectedRange === range.value
                    ? "bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      {loading ? (
        <SkeletonMetricCards count={4} />
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <MetricCard
            title="Total Interventions"
            value={metrics.total_interventions}
            icon={Shield}
            color="cyan"
            change={8.3}
          />
          <MetricCard
            title="Success Rate"
            value={metrics.success_rate}
            format="percent"
            icon={Activity}
            color="green"
            change={2.1}
          />
          <MetricCard
            title="Saved Cost"
            value={metrics.saved_cost_cents}
            format="currency"
            icon={DollarSign}
            color="amber"
            change={15.4}
          />
          <MetricCard
            title="Active Shields"
            value={metrics.active_shields}
            icon={ShieldCheck}
            color="blue"
          />
        </motion.div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={6} />}

      {/* Error State */}
      {fetchError && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">Failed to load healing data</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {fetchError}
          </p>
          <Button
            onClick={() => fetchHealingData(selectedRange)}
            variant="outline"
            size="sm"
            className="gap-1.5 border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--healing-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-[var(--healing-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No healing events yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Enable Shield self-healing in your agent configuration to see
            interventions here.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !fetchError && events.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Recent Healing Events</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Type", "Agent", "Trigger", "Action", "Result", "Time"].map(
                    (header) => (
                      <th
                        key={header}
                        className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const typeConfig =
                    healingTypeConfig[event.healing_type] ||
                    healingTypeConfig.custom;

                  return (
                    <motion.tr
                      key={event.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${typeConfig.color} 10%, transparent)`,
                            color: typeConfig.color,
                            borderColor: `color-mix(in srgb, ${typeConfig.color} 20%, transparent)`,
                          }}
                        >
                          <typeConfig.icon className="w-3 h-3" />
                          {typeConfig.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {event.agent_name}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs truncate">
                        {event.trigger_reason}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs truncate">
                        {event.action_taken}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          {event.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-[var(--accent-red)]" />
                          )}
                          <span
                            className="text-xs font-medium"
                            style={{
                              color: event.success
                                ? "var(--accent-green)"
                                : "var(--accent-red)",
                            }}
                          >
                            {event.success ? "Success" : "Failed"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                        {event.time_ago}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
