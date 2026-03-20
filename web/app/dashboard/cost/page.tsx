"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Target,
  Gauge,
  BarChart3,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import {
  SkeletonMetricCards,
  SkeletonChart,
  SkeletonTable,
} from "@/components/skeleton";

// --- Mock Data ---
const mockMetrics = {
  total_spend_cents: 347200,
  avg_cost_per_session_cents: 27,
  cost_per_outcome_cents: 142,
  budget_utilization: 68.4,
};

interface TopSpender {
  agent: string;
  model: string;
  sessions: number;
  total_cost_cents: number;
  avg_cost_per_session_cents: number;
}

const mockSpenders: TopSpender[] = [
  {
    agent: "Code Review Agent",
    model: "gpt-4o",
    sessions: 3102,
    total_cost_cents: 108570,
    avg_cost_per_session_cents: 35,
  },
  {
    agent: "Data Pipeline Agent",
    model: "gpt-4o",
    sessions: 1990,
    total_cost_cents: 103480,
    avg_cost_per_session_cents: 52,
  },
  {
    agent: "Research Agent",
    model: "gpt-4o",
    sessions: 4821,
    total_cost_cents: 67500,
    avg_cost_per_session_cents: 14,
  },
  {
    agent: "Research Agent",
    model: "claude-3-5-sonnet",
    sessions: 1240,
    total_cost_cents: 44640,
    avg_cost_per_session_cents: 36,
  },
  {
    agent: "Support Agent",
    model: "gpt-4o-mini",
    sessions: 2934,
    total_cost_cents: 23472,
    avg_cost_per_session_cents: 8,
  },
];

function formatCost(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(3)}`;
}

function formatCostLarge(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CostOverviewPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockSpenders.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Cost Intelligence</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Track spend, analyze cost efficiency, and manage budgets
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
            title="Total Spend"
            value={mockMetrics.total_spend_cents}
            format="currency"
            icon={DollarSign}
            color="green"
            change={5.7}
          />
          <MetricCard
            title="Avg Cost / Session"
            value={mockMetrics.avg_cost_per_session_cents}
            format="currency"
            icon={TrendingUp}
            color="blue"
            change={-3.2}
          />
          <MetricCard
            title="Cost / Outcome"
            value={mockMetrics.cost_per_outcome_cents}
            format="currency"
            icon={Target}
            color="purple"
            change={-1.8}
          />
          <MetricCard
            title="Budget Utilization"
            value={mockMetrics.budget_utilization}
            format="percent"
            icon={Gauge}
            color="amber"
            change={8.1}
          />
        </motion.div>
      )}

      {/* Chart Placeholder */}
      {loading ? (
        <SkeletonChart />
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-medium mb-4">Cost Over Time</h3>
          <div className="h-48 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
            <div className="text-center">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Chart will be implemented with D3.js</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={5} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-green)]/10 flex items-center justify-center mx-auto mb-4">
            <DollarSign className="w-6 h-6 text-[var(--accent-green)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No cost data yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Cost tracking will populate as agent sessions are recorded and
            tokens are consumed.
          </p>
        </div>
      )}

      {/* Top Spenders Table */}
      {!loading && mockSpenders.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Top Spenders</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    "Agent",
                    "Model",
                    "Sessions",
                    "Total Cost",
                    "Avg Cost / Session",
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
                {mockSpenders.map((spender) => (
                  <motion.tr
                    key={`${spender.agent}-${spender.model}`}
                    variants={staggerItem}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 text-sm font-medium">
                      {spender.agent}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-[var(--text-secondary)]">
                      {spender.model}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {spender.sessions.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-sm font-medium">
                      {formatCostLarge(spender.total_cost_cents)}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {formatCost(spender.avg_cost_per_session_cents)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
