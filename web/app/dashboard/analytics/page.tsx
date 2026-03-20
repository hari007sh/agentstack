"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Activity,
  AlertTriangle,
  DollarSign,
  Clock,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonMetricCards, SkeletonChart, SkeletonTable } from "@/components/skeleton";

// --- Mock Data ---
const mockMetrics = {
  total_sessions: 12847,
  avg_duration_ms: 5400,
  failure_rate: 4.2,
  total_cost_cents: 284750,
};

const mockAgentStats = [
  {
    name: "Research Agent",
    sessions: 4821,
    failure_rate: 2.1,
    avg_duration: "3.2s",
    avg_cost: "$0.14",
    total_cost: "$675.00",
  },
  {
    name: "Code Review Agent",
    sessions: 3102,
    failure_rate: 5.8,
    avg_duration: "8.4s",
    avg_cost: "$0.35",
    total_cost: "$1,085.70",
  },
  {
    name: "Support Agent",
    sessions: 2934,
    failure_rate: 6.4,
    avg_duration: "2.1s",
    avg_cost: "$0.08",
    total_cost: "$234.72",
  },
  {
    name: "Data Pipeline Agent",
    sessions: 1990,
    failure_rate: 3.1,
    avg_duration: "12.3s",
    avg_cost: "$0.52",
    total_cost: "$1,034.80",
  },
];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockAgentStats.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Aggregate performance and cost analytics across agents
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
            title="Total Sessions"
            value={mockMetrics.total_sessions}
            icon={Activity}
            color="blue"
            change={12.5}
          />
          <MetricCard
            title="Avg Duration"
            value={mockMetrics.avg_duration_ms}
            format="duration"
            icon={Clock}
            color="purple"
            change={-3.2}
          />
          <MetricCard
            title="Failure Rate"
            value={mockMetrics.failure_rate}
            format="percent"
            icon={AlertTriangle}
            color="red"
            change={-2.1}
          />
          <MetricCard
            title="Total Cost"
            value={mockMetrics.total_cost_cents}
            format="currency"
            icon={DollarSign}
            color="green"
            change={5.7}
          />
        </motion.div>
      )}

      {/* Charts Row */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <h3 className="text-sm font-medium mb-4">Sessions Over Time</h3>
            <div className="h-48 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Chart will be implemented with D3.js</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
            <h3 className="text-sm font-medium mb-4">Failure Rate Trend</h3>
            <div className="h-48 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
              <div className="text-center">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Chart will be implemented with D3.js</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No analytics data yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Analytics will populate once agent sessions are recorded.
          </p>
        </div>
      )}

      {/* Stats Breakdown by Agent */}
      {loading ? (
        <SkeletonTable rows={4} cols={6} />
      ) : (
        mockAgentStats.length > 0 && (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">Stats by Agent</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {[
                      "Agent",
                      "Sessions",
                      "Failure Rate",
                      "Avg Duration",
                      "Avg Cost",
                      "Total Cost",
                    ].map((header) => (
                      <th
                        key={header}
                        className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mockAgentStats.map((agent) => (
                    <motion.tr
                      key={agent.name}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-medium">
                        {agent.name}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {agent.sessions.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="text-sm"
                          style={{
                            color:
                              agent.failure_rate > 5
                                ? "var(--accent-red)"
                                : agent.failure_rate > 3
                                ? "var(--accent-amber)"
                                : "var(--accent-green)",
                          }}
                        >
                          {agent.failure_rate}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {agent.avg_duration}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {agent.avg_cost}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {agent.total_cost}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )
      )}
    </motion.div>
  );
}
