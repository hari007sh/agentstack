"use client";

import { useState, useEffect } from "react";
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
import type { HealingEvent } from "@/lib/types";

// --- Mock Data ---
const mockMetrics = {
  total_interventions: 342,
  success_rate: 94.7,
  saved_cost_cents: 128400,
  active_shields: 5,
};

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

export default function HealingPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockEvents.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Healing Interventions</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Self-healing actions taken by Shield to recover agent failures
        </p>
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
            value={mockMetrics.total_interventions}
            icon={Shield}
            color="cyan"
            change={8.3}
          />
          <MetricCard
            title="Success Rate"
            value={mockMetrics.success_rate}
            format="percent"
            icon={Activity}
            color="green"
            change={2.1}
          />
          <MetricCard
            title="Saved Cost"
            value={mockMetrics.saved_cost_cents}
            format="currency"
            icon={DollarSign}
            color="amber"
            change={15.4}
          />
          <MetricCard
            title="Active Shields"
            value={mockMetrics.active_shields}
            icon={ShieldCheck}
            color="blue"
          />
        </motion.div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={6} />}

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
      {!loading && mockEvents.length > 0 && (
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
                {mockEvents.map((event) => {
                  const typeConfig =
                    healingTypeConfig[event.healing_type] ||
                    healingTypeConfig.custom;

                  return (
                    <motion.tr
                      key={event.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${typeConfig.color} 12%, transparent)`,
                            color: typeConfig.color,
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
                            className="text-xs"
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
