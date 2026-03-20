"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  ListChecks,
  Eye,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonMetricCards, SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Guard type display names — maps backend guard_type to human-readable name
// ---------------------------------------------------------------------------
const guardTypeDisplayNames: Record<string, string> = {
  pii: "PII Detection",
  toxicity: "Toxicity Filter",
  injection: "Prompt Injection",
  hallucination: "Hallucination Check",
  topic: "Topic Guard",
  code_exec: "Code Execution Guard",
  length: "Length Guard",
  custom: "Custom Policy",
};

// Default zero metrics for initial state and empty data
const zeroMetrics = {
  total_checks: 0,
  block_rate: 0,
  avg_latency_ms: 0,
  active_rules: 0,
};

interface GuardEventUI {
  id: string;
  time_ago: string;
  content: string;
  type: "input" | "output";
  action: "passed" | "blocked" | "warned";
  guardrail_name: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// Action badge config
// ---------------------------------------------------------------------------
const actionConfig: Record<
  string,
  { color: string; label: string; bgClass: string }
> = {
  passed: {
    color: "var(--accent-green)",
    label: "Passed",
    bgClass:
      "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20",
  },
  blocked: {
    color: "var(--accent-red)",
    label: "Blocked",
    bgClass:
      "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20",
  },
  warned: {
    color: "var(--accent-amber)",
    label: "Warned",
    bgClass:
      "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20",
  },
};

// ---------------------------------------------------------------------------
// API response shapes (match Go backend exactly)
// ---------------------------------------------------------------------------

/** GET /v1/guard/analytics response — matches store.GuardAnalytics */
interface GuardAnalyticsResponse {
  total_checks: number;
  total_blocked: number;
  total_warned: number;
  total_passed: number;
  block_rate: number;
  by_type: { guard_type: string; total: number; blocked: number; warned: number; passed: number }[];
}

/** Single event from GET /v1/guard/events — matches store.GuardEvent */
interface GuardEventAPI {
  id: string;
  org_id: string;
  guardrail_id: string;
  session_id?: string | null;
  action: string;
  guard_type: string;
  input_text?: string | null;
  findings: unknown;
  latency_ms: number;
  created_at: string;
}

/** GET /v1/guard/events response envelope */
interface GuardEventsListResponse {
  events: GuardEventAPI[];
  total: number;
  limit: number;
  offset: number;
}

/** GET /v1/guard/rules response envelope */
interface GuardRulesListResponse {
  guardrails: { id: string; name: string; type: string; enabled: boolean; apply_to: string }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute a human-readable relative time string from an ISO date. */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (hours < 24) {
    return remainMinutes > 0 ? `${hours}h ${remainMinutes}m ago` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Map a backend GuardEventAPI to the UI shape.
 * Uses the guardrail rules map to look up the display name and apply_to direction.
 */
function mapApiEventToUI(
  ev: GuardEventAPI,
  rulesMap: Map<string, { name: string; apply_to: string }>
): GuardEventUI {
  const rule = rulesMap.get(ev.guardrail_id);
  const guardrailName = rule?.name ?? guardTypeDisplayNames[ev.guard_type] ?? ev.guard_type;

  // Derive input/output type: prefer the rule's apply_to; if "both", default to "input"
  let direction: "input" | "output" = "input";
  if (rule?.apply_to === "output") {
    direction = "output";
  } else if (rule?.apply_to === "both") {
    // Heuristic: if the action is hallucination or toxicity, treat as output check
    if (ev.guard_type === "hallucination" || ev.guard_type === "toxicity") {
      direction = "output";
    }
  }

  return {
    id: ev.id,
    time_ago: timeAgo(ev.created_at),
    content: ev.input_text ?? "(content not stored)",
    type: direction,
    action: ev.action as "passed" | "blocked" | "warned",
    guardrail_name: guardrailName,
    latency_ms: ev.latency_ms,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GuardOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [events, setEvents] = useState<GuardEventUI[]>([]);
  const [metrics, setMetrics] = useState(zeroMetrics);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchGuardData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    // Set auth token from localStorage
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }

    try {
      // Fetch analytics, events, and rules in parallel
      const [analyticsData, eventsData, rulesData] = await Promise.all([
        api.get<GuardAnalyticsResponse>("/v1/guard/analytics"),
        api.get<GuardEventsListResponse>("/v1/guard/events?limit=50"),
        api.get<GuardRulesListResponse>("/v1/guard/rules"),
      ]);

      // Build guardrail lookup map: id -> { name, apply_to }
      const rulesMap = new Map<string, { name: string; apply_to: string }>();
      for (const rule of rulesData.guardrails ?? []) {
        rulesMap.set(rule.id, { name: rule.name, apply_to: rule.apply_to });
      }

      // Compute avg latency from events if available
      const eventsList = eventsData.events ?? [];
      const avgLatency =
        eventsList.length > 0
          ? Math.round(eventsList.reduce((sum, e) => sum + e.latency_ms, 0) / eventsList.length)
          : 0;

      // Count enabled rules for "Active Rules" metric
      const activeRules = (rulesData.guardrails ?? []).filter((r) => r.enabled).length;

      // Map analytics to metrics
      setMetrics({
        total_checks: Number(analyticsData.total_checks) || 0,
        block_rate:
          analyticsData.block_rate > 1
            ? analyticsData.block_rate
            : Math.round(analyticsData.block_rate * 1000) / 10, // backend returns 0-1, UI wants percentage
        avg_latency_ms: avgLatency,
        active_rules: activeRules,
      });

      // Map API events to UI events
      const uiEvents = eventsList.map((ev) => mapApiEventToUI(ev, rulesMap));
      setEvents(uiEvents);
      setLoading(false);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load guard data";

      console.error(
        `[AgentStack] ${new Date().toISOString()} GuardPage: API call failed. Reason: ${message}`
      );

      setFetchError(message);
      setMetrics(zeroMetrics);
      setEvents([]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGuardData();
  }, [fetchGuardData]);

  const isEmpty = !loading && !fetchError && events.length === 0;

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

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
          <h1 className="text-xl font-semibold">Guardrails</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Monitor content safety checks and guard rule activity
          </p>
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
            title="Total Checks"
            value={metrics.total_checks}
            icon={ShieldCheck}
            color="blue"
            change={14.2}
          />
          <MetricCard
            title="Block Rate"
            value={metrics.block_rate}
            format="percent"
            icon={ShieldAlert}
            color="red"
            change={-0.8}
          />
          <MetricCard
            title="Avg Latency"
            value={metrics.avg_latency_ms}
            format="duration"
            icon={Clock}
            color="purple"
            change={-5.1}
          />
          <MetricCard
            title="Active Rules"
            value={metrics.active_rules}
            icon={ListChecks}
            color="green"
          />
        </motion.div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={6} cols={6} />}

      {/* Error State */}
      {fetchError && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">Failed to load guard data</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {fetchError}
          </p>
          <Button
            onClick={fetchGuardData}
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
          <div className="w-14 h-14 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-5">
            <ShieldCheck className="w-7 h-7 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">
            No guard events yet
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
            Configure guardrails to automatically check inputs and outputs for
            PII, prompt injection, toxicity, and hallucinations.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.href = "/dashboard/guard/rules/new"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              Create First Guard Rule
              <span aria-hidden="true">&rarr;</span>
            </button>
            <a
              href="https://docs.agentstack.dev/guard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-default)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              View Docs
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
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
            <h3 className="text-sm font-medium">Recent Guard Events</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Time", "Content", "Type", "Action", "Guardrail", "Latency"].map(
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
                  const ac = actionConfig[event.action] ?? actionConfig.passed;
                  const isExpanded = expandedRow === event.id;
                  return (
                    <motion.tr
                      key={event.id}
                      variants={staggerItem}
                      onClick={() => toggleRow(event.id)}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3 text-xs text-[var(--text-tertiary)] whitespace-nowrap align-top">
                        {event.time_ago}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-sm align-top">
                        <div className="flex items-start gap-2">
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex-shrink-0 mt-0.5"
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors" />
                          </motion.div>
                          <div className="min-w-0">
                            <p className={isExpanded ? "" : "truncate"}>
                              {event.content}
                            </p>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="mt-2 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed"
                                >
                                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                                    Full Content
                                  </p>
                                  {event.content}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium uppercase bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                          <Eye className="w-3 h-3" />
                          {event.type}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${ac.bgClass}`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: ac.color }}
                          />
                          {ac.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] align-top">
                        {event.guardrail_name}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] tabular-nums align-top">
                        {event.latency_ms}ms
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
