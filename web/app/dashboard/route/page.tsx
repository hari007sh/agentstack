"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Route,
  Database,
  Clock,
  Server,
  BarChart3,
  CheckCircle2,
  XCircle,
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
  total_requests: 184320,
  cache_hit_rate: 34.2,
  avg_latency_ms: 245,
  active_providers: 4,
};

interface GatewayRequest {
  id: string;
  time_ago: string;
  model: string;
  provider: string;
  status: "success" | "error";
  tokens: number;
  cost_cents: number;
  latency_ms: number;
  cache_hit: boolean;
}

const mockRequests: GatewayRequest[] = [
  {
    id: "req_001",
    time_ago: "5s ago",
    model: "gpt-4o",
    provider: "openai",
    status: "success",
    tokens: 1240,
    cost_cents: 4,
    latency_ms: 320,
    cache_hit: false,
  },
  {
    id: "req_002",
    time_ago: "12s ago",
    model: "claude-3-5-sonnet",
    provider: "anthropic",
    status: "success",
    tokens: 890,
    cost_cents: 3,
    latency_ms: 18,
    cache_hit: true,
  },
  {
    id: "req_003",
    time_ago: "28s ago",
    model: "gpt-4o-mini",
    provider: "openai",
    status: "success",
    tokens: 2100,
    cost_cents: 1,
    latency_ms: 185,
    cache_hit: false,
  },
  {
    id: "req_004",
    time_ago: "45s ago",
    model: "gemini-1.5-pro",
    provider: "google",
    status: "error",
    tokens: 0,
    cost_cents: 0,
    latency_ms: 5200,
    cache_hit: false,
  },
  {
    id: "req_005",
    time_ago: "1 min ago",
    model: "llama-3.1-70b",
    provider: "together",
    status: "success",
    tokens: 1560,
    cost_cents: 1,
    latency_ms: 410,
    cache_hit: false,
  },
  {
    id: "req_006",
    time_ago: "1 min ago",
    model: "gpt-4o",
    provider: "openai",
    status: "success",
    tokens: 680,
    cost_cents: 2,
    latency_ms: 12,
    cache_hit: true,
  },
  {
    id: "req_007",
    time_ago: "2 min ago",
    model: "claude-3-5-sonnet",
    provider: "anthropic",
    status: "success",
    tokens: 3200,
    cost_cents: 8,
    latency_ms: 540,
    cache_hit: false,
  },
  {
    id: "req_008",
    time_ago: "3 min ago",
    model: "mixtral-8x7b",
    provider: "groq",
    status: "success",
    tokens: 920,
    cost_cents: 0,
    latency_ms: 95,
    cache_hit: false,
  },
];

const providerColors: Record<string, string> = {
  openai: "var(--accent-green)",
  anthropic: "var(--accent-amber)",
  google: "var(--accent-blue)",
  together: "var(--accent-purple)",
  groq: "var(--healing-blue)",
  mistral: "var(--accent-red)",
};

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function RouteOverviewPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockRequests.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Gateway</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Monitor LLM gateway traffic, caching, and provider routing
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
            title="Total Requests"
            value={mockMetrics.total_requests}
            icon={Route}
            color="blue"
            change={18.4}
          />
          <MetricCard
            title="Cache Hit Rate"
            value={mockMetrics.cache_hit_rate}
            format="percent"
            icon={Database}
            color="green"
            change={4.2}
          />
          <MetricCard
            title="Avg Latency"
            value={mockMetrics.avg_latency_ms}
            format="duration"
            icon={Clock}
            color="purple"
            change={-8.5}
          />
          <MetricCard
            title="Active Providers"
            value={mockMetrics.active_providers}
            icon={Server}
            color="amber"
          />
        </motion.div>
      )}

      {/* Chart Placeholder */}
      {loading ? (
        <SkeletonChart />
      ) : (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-medium mb-4">
            Request Distribution by Provider
          </h3>
          <div className="h-48 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
            <div className="text-center">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Chart will be implemented with D3.js</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={6} cols={8} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Route className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No gateway requests yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Route LLM requests through the AgentStack gateway to see traffic
            analytics here.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && mockRequests.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Recent Requests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    "Time",
                    "Model",
                    "Provider",
                    "Status",
                    "Tokens",
                    "Cost",
                    "Latency",
                    "Cache",
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
                {mockRequests.map((req) => (
                  <motion.tr
                    key={req.id}
                    variants={staggerItem}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                      {req.time_ago}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono">
                      {req.model}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${providerColors[req.provider] || "var(--text-tertiary)"} 12%, transparent)`,
                          color: providerColors[req.provider] || "var(--text-tertiary)",
                        }}
                      >
                        {req.provider}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {req.status === "success" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-[var(--accent-red)]" />
                        )}
                        <span
                          className="text-xs capitalize"
                          style={{
                            color:
                              req.status === "success"
                                ? "var(--accent-green)"
                                : "var(--accent-red)",
                          }}
                        >
                          {req.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {req.tokens > 0 ? formatTokens(req.tokens) : "\u2014"}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {req.cost_cents > 0
                        ? formatCost(req.cost_cents)
                        : "\u2014"}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      <span
                        style={{
                          color:
                            req.latency_ms > 1000
                              ? "var(--accent-red)"
                              : req.latency_ms > 500
                              ? "var(--accent-amber)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {req.latency_ms}ms
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {req.cache_hit ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--accent-green)]/10 text-[var(--accent-green)]">
                          HIT
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          MISS
                        </span>
                      )}
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
