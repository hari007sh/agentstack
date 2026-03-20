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

// Default zero metrics for initial state and empty data
const zeroMetrics = {
  total_interventions: 0,
  success_rate: 0,
  saved_cost_cents: 0,
  active_shields: 0,
};

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
  const [events, setEvents] = useState<(HealingEvent & { time_ago: string })[]>([]);
  const [metrics, setMetrics] = useState(zeroMetrics);
  const [selectedRange, setSelectedRange] = useState("24h");

  const fetchHealingData = useCallback(
    async (range: string) => {
      setLoading(true);
      setFetchError(null);

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
          saved_cost_cents: 0, // not available from analytics endpoint yet
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
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load healing data";

        console.error(
          `[AgentStack] ${new Date().toISOString()} HealingPage: API call failed. Reason: ${message}`
        );

        setFetchError(message);
        setMetrics(zeroMetrics);
        setEvents([]);
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchHealingData(selectedRange);
  }, [fetchHealingData, selectedRange]);

  const isEmpty = !loading && !fetchError && events.length === 0 && metrics.total_interventions === 0;

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
          <div className="w-14 h-14 rounded-xl bg-[var(--healing-blue)]/10 flex items-center justify-center mx-auto mb-5">
            <Shield className="w-7 h-7 text-[var(--healing-blue)]" />
          </div>
          <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">
            No healing interventions yet
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-2">
            Shield will automatically detect and fix agent failures like loops,
            hallucinations, cost overruns, and timeouts.
          </p>
          <p className="text-sm text-[var(--text-tertiary)] max-w-md mx-auto mb-6">
            Enable Shield in your SDK to get started.
          </p>

          {/* Code snippet */}
          <div className="max-w-sm mx-auto mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden text-left">
            <div className="px-3 py-1.5 border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
              Quick Start
            </div>
            <pre className="px-4 py-3 text-xs leading-relaxed overflow-x-auto font-mono text-[var(--text-secondary)]">
              <code>{`import agentstack

agentstack.init(
    api_key="your-key",
    shield=True
)`}</code>
            </pre>
          </div>

          <a
            href="https://docs.agentstack.dev/shield"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors"
          >
            Learn about Shield
            <span aria-hidden="true">&rarr;</span>
          </a>
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
