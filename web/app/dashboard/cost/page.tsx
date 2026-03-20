"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Target,
  Gauge,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { StackedAreaChart } from "@/components/charts";
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
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types matching backend response shapes
// ---------------------------------------------------------------------------

interface CostSummaryResponse {
  total_spend_cents: number;
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_per_session_cents: number;
  unique_models: number;
  unique_agents: number;
  trend: { date: string; spend_cents: number; events: number }[];
}

interface ModelCostBreakdown {
  model: string;
  provider: string;
  total_cost_cents: number;
  total_events: number;
  total_input_tokens: number;
  total_output_tokens: number;
  avg_cost_cents: number;
}

interface TopSpender {
  name: string;
  type: string; // "agent" or "model"
  total_cost_cents: number;
  total_events: number;
}

interface BudgetWithUtil {
  id: string;
  name: string;
  limit_cents: number;
  current_spend_cents: number;
  utilization_pct: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Mock / Fallback Data
// ---------------------------------------------------------------------------

const mockMetrics = {
  total_spend_cents: 347200,
  avg_cost_per_session_cents: 27,
  cost_per_outcome_cents: 142,
  budget_utilization: 68.4,
};

interface MockSpender {
  agent: string;
  model: string;
  sessions: number;
  total_cost_cents: number;
  avg_cost_per_session_cents: number;
}

const mockSpenders: MockSpender[] = [
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

const mockCostLabels = ["Mar 14", "Mar 15", "Mar 16", "Mar 17", "Mar 18", "Mar 19", "Mar 20"];
const mockCostSeries = [
  {
    name: "GPT-4o",
    color: "#10a37f",
    data: [28400, 31200, 26800, 34100, 29500, 32800, 30200],
  },
  {
    name: "Claude 3.5",
    color: "#d4a574",
    data: [12300, 14500, 11800, 15200, 13900, 16100, 14800],
  },
  {
    name: "GPT-4o Mini",
    color: "#6ee7b7",
    data: [4200, 3800, 4500, 3600, 4100, 3900, 4300],
  },
  {
    name: "Other",
    color: "#8b5cf6",
    data: [2100, 1800, 2400, 1900, 2200, 2000, 2300],
  },
];

// ---------------------------------------------------------------------------
// Model color map for chart series
// ---------------------------------------------------------------------------
const MODEL_COLORS: Record<string, string> = {
  "gpt-4o": "#10a37f",
  "gpt-4o-mini": "#6ee7b7",
  "gpt-4-turbo": "#34d399",
  "claude-3-5-sonnet": "#d4a574",
  "claude-3-opus": "#f59e0b",
  "gemini-1.5-pro": "#4285f4",
  "llama-3.1-70b": "#a855f7",
  "mixtral-8x7b": "#f55036",
};

function getModelColor(model: string, idx: number): string {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model];
  const fallback = ["#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16"];
  return fallback[idx % fallback.length];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCost(cents: number): string {
  if (cents >= 100) return `$${(cents / 100).toFixed(2)}`;
  return `$${(cents / 100).toFixed(3)}`;
}

function formatCostLarge(cents: number): string {
  if (cents >= 100000) return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function CostOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  // Real data state
  const [metrics, setMetrics] = useState(mockMetrics);
  const [spenders, setSpenders] = useState<MockSpender[]>(mockSpenders);
  const [costLabels, setCostLabels] = useState<string[]>(mockCostLabels);
  const [costSeries, setCostSeries] = useState(mockCostSeries);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Set token from localStorage for API auth
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }

    try {
      // Fetch cost summary + trend, by-model breakdown, top spenders, and budgets in parallel
      const [summaryRes, byModelRes, topSpendersRes, budgetsRes] = await Promise.all([
        api.get<CostSummaryResponse>("/v1/cost/analytics/summary"),
        api.get<{ models: ModelCostBreakdown[] }>("/v1/cost/analytics/by-model"),
        api.get<{ spenders: TopSpender[] }>("/v1/cost/analytics/top-spenders?limit=10"),
        api.get<{ budgets: BudgetWithUtil[] }>("/v1/cost/budgets"),
      ]);

      // --- Map summary to metrics ---
      const budgetUtil = budgetsRes.budgets.length > 0
        ? budgetsRes.budgets.reduce((sum, b) => sum + b.utilization_pct, 0) / budgetsRes.budgets.length
        : 0;

      // Estimate cost per outcome from total spend / total events (the closest proxy)
      const costPerOutcome = summaryRes.total_events > 0
        ? Math.round(summaryRes.total_spend_cents / summaryRes.total_events)
        : 0;

      setMetrics({
        total_spend_cents: Number(summaryRes.total_spend_cents),
        avg_cost_per_session_cents: Number(summaryRes.avg_cost_per_session_cents),
        cost_per_outcome_cents: costPerOutcome,
        budget_utilization: budgetUtil,
      });

      // --- Map trend to chart ---
      if (summaryRes.trend && summaryRes.trend.length > 0) {
        // Build labels from dates
        const labels = summaryRes.trend.map((p) => {
          const d = new Date(p.date);
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        });

        // Build per-model series from by-model data and trend
        // Since trend is aggregate, we use by-model proportions to split
        if (byModelRes.models.length > 0) {
          const totalModelCost = byModelRes.models.reduce((s, m) => s + Number(m.total_cost_cents), 0);

          // Take top 4 models, lump the rest as "Other"
          const sorted = [...byModelRes.models].sort((a, b) => Number(b.total_cost_cents) - Number(a.total_cost_cents));
          const topModels = sorted.slice(0, 3);
          const otherCost = sorted.slice(3).reduce((s, m) => s + Number(m.total_cost_cents), 0);

          const series = topModels.map((m, idx) => {
            const proportion = totalModelCost > 0 ? Number(m.total_cost_cents) / totalModelCost : 0;
            return {
              name: m.model,
              color: getModelColor(m.model, idx),
              data: summaryRes.trend.map((p) => Math.round(Number(p.spend_cents) * proportion)),
            };
          });

          if (otherCost > 0) {
            const otherProportion = totalModelCost > 0 ? otherCost / totalModelCost : 0;
            series.push({
              name: "Other",
              color: "#8b5cf6",
              data: summaryRes.trend.map((p) => Math.round(Number(p.spend_cents) * otherProportion)),
            });
          }

          setCostLabels(labels);
          setCostSeries(series);
        } else {
          // No model breakdown — show single series
          setCostLabels(labels);
          setCostSeries([{
            name: "Total",
            color: "#10a37f",
            data: summaryRes.trend.map((p) => Number(p.spend_cents)),
          }]);
        }
      }

      // --- Map top spenders to table ---
      // The backend returns a union of agent + model spenders.
      // Map them to the table format the UI expects.
      if (topSpendersRes.spenders.length > 0) {
        const mapped: MockSpender[] = topSpendersRes.spenders.map((s) => ({
          agent: s.type === "agent" ? s.name : "",
          model: s.type === "model" ? s.name : s.type,
          sessions: Number(s.total_events),
          total_cost_cents: Number(s.total_cost_cents),
          avg_cost_per_session_cents: s.total_events > 0
            ? Math.round(Number(s.total_cost_cents) / Number(s.total_events))
            : 0,
        }));
        setSpenders(mapped);
      } else {
        setSpenders([]);
      }

      setUsingMock(false);
    } catch (err) {
      console.warn("[CostPage] API fetch failed, using mock data:", err);
      // Fall back to mock data
      setMetrics(mockMetrics);
      setSpenders(mockSpenders);
      setCostLabels(mockCostLabels);
      setCostSeries(mockCostSeries);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isEmpty = !loading && spenders.length === 0;

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

      {/* Error Banner */}
      {error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-red)]" />
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Mock Data Indicator (dev only) */}
      {usingMock && !loading && (
        <div className="rounded-lg border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5 px-4 py-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
          <p className="text-xs text-[var(--accent-amber)]">
            Showing sample data. Connect the backend to see real metrics.
          </p>
        </div>
      )}

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
            value={metrics.total_spend_cents}
            format="currency"
            icon={DollarSign}
            color="green"
            change={5.7}
          />
          <MetricCard
            title="Avg Cost / Session"
            value={metrics.avg_cost_per_session_cents}
            format="currency"
            icon={TrendingUp}
            color="blue"
            change={-3.2}
          />
          <MetricCard
            title="Cost / Outcome"
            value={metrics.cost_per_outcome_cents}
            format="currency"
            icon={Target}
            color="purple"
            change={-1.8}
          />
          <MetricCard
            title="Budget Utilization"
            value={metrics.budget_utilization}
            format="percent"
            icon={Gauge}
            color="amber"
            change={8.1}
          />
        </motion.div>
      )}

      {/* Cost Over Time Chart */}
      {loading ? (
        <SkeletonChart />
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-medium mb-4">Cost Over Time</h3>
          <StackedAreaChart
            labels={costLabels}
            series={costSeries}
            height={210}
            formatValue={(v) => `$${(v / 100).toFixed(0)}`}
          />
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
      {!loading && spenders.length > 0 && (
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
                {spenders.map((spender, idx) => (
                  <motion.tr
                    key={`${spender.agent}-${spender.model}-${idx}`}
                    variants={staggerItem}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 text-sm font-medium">
                      {spender.agent || "\u2014"}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono text-[var(--text-secondary)]">
                      {spender.model || "\u2014"}
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
