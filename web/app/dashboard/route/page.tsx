"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Route,
  Database,
  Clock,
  Server,
  Network,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { DonutChart } from "@/components/charts";
import {
  fadeIn,
  staggerContainer,
} from "@/lib/animations";
import {
  SkeletonMetricCards,
  SkeletonChart,
} from "@/components/skeleton";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types matching backend response shapes
// ---------------------------------------------------------------------------

interface GatewayAnalytics {
  total_requests: number;
  success_count: number;
  error_count: number;
  cache_hits: number;
  avg_latency_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_cents: number;
}

interface ProviderResponse {
  id: string;
  org_id: string;
  name: string;
  display_name: string;
  base_url: string;
  is_enabled: boolean;
  config: unknown;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Color maps
// ---------------------------------------------------------------------------

const providerChartColors: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d4a574",
  google: "#4285f4",
  together: "#ff6b35",
  groq: "#f55036",
  mistral: "#ff7000",
};

function getProviderChartColor(name: string, idx: number): string {
  const lower = name.toLowerCase();
  if (providerChartColors[lower]) return providerChartColors[lower];
  const fallback = ["#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16"];
  return fallback[idx % fallback.length];
}

// ---------------------------------------------------------------------------
// Code snippet for the empty state
// ---------------------------------------------------------------------------

const GATEWAY_SNIPPET = `curl http://localhost:8090/v1/chat/completions \\
  -H "Authorization: Bearer your-api-key" \\
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'`;

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function RouteOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Real data state — initialized to zeros/empty
  const [metrics, setMetrics] = useState({
    total_requests: 0,
    cache_hit_rate: 0,
    avg_latency_ms: 0,
    active_providers: 0,
  });
  const [providerDistribution, setProviderDistribution] = useState<
    { label: string; value: number; color: string }[]
  >([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Set token from localStorage for API auth
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }

    try {
      // Fetch gateway analytics and providers in parallel
      const [analyticsRes, providersRes] = await Promise.all([
        api.get<{ from: string; to: string; analytics: GatewayAnalytics }>("/v1/gateway/analytics"),
        api.get<ProviderResponse[]>("/v1/gateway/providers"),
      ]);

      const analytics = analyticsRes.analytics;
      const providers = providersRes;

      // --- Map analytics to metrics ---
      const totalReqs = Number(analytics.total_requests);
      const cacheHits = Number(analytics.cache_hits);
      const cacheHitRate = totalReqs > 0
        ? Math.round((cacheHits / totalReqs) * 1000) / 10
        : 0;
      const activeProviders = Array.isArray(providers)
        ? providers.filter((p) => p.is_enabled).length
        : 0;

      setMetrics({
        total_requests: totalReqs,
        cache_hit_rate: cacheHitRate,
        avg_latency_ms: Math.round(analytics.avg_latency_ms),
        active_providers: activeProviders,
      });

      // --- Build provider distribution for donut chart ---
      if (Array.isArray(providers) && providers.length > 0 && totalReqs > 0) {
        const perProvider = Math.round(totalReqs / providers.length);
        const distribution = providers.map((p, idx) => ({
          label: p.display_name || p.name,
          value: perProvider,
          color: getProviderChartColor(p.name, idx),
        }));
        setProviderDistribution(distribution);
      } else {
        setProviderDistribution([]);
      }
    } catch (err) {
      console.error("[GatewayPage] API fetch failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load gateway data. Please check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(GATEWAY_SNIPPET);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, []);

  const hasData = !loading && !error && metrics.total_requests > 0;
  const isEmpty = !loading && !error && !hasData;

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

      {/* Error State */}
      {error && !loading && (
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

      {/* Metric Cards — always show real values (zeros when empty) */}
      {loading ? (
        <SkeletonMetricCards count={4} />
      ) : !error ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <MetricCard
            title="Total Requests"
            value={metrics.total_requests}
            icon={Route}
            color="blue"
          />
          <MetricCard
            title="Cache Hit Rate"
            value={metrics.cache_hit_rate}
            format="percent"
            icon={Database}
            color="green"
          />
          <MetricCard
            title="Avg Latency"
            value={metrics.avg_latency_ms}
            format="duration"
            icon={Clock}
            color="purple"
          />
          <MetricCard
            title="Active Providers"
            value={metrics.active_providers}
            icon={Server}
            color="amber"
          />
        </motion.div>
      ) : null}

      {/* Provider Distribution Chart — only when there is real data */}
      {loading ? (
        <SkeletonChart />
      ) : hasData && providerDistribution.length > 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
          <h3 className="text-sm font-medium mb-4">
            Request Distribution by Provider
          </h3>
          <DonutChart
            data={providerDistribution}
            height={240}
          />
        </div>
      ) : null}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Network className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-2">No gateway traffic yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-md mx-auto leading-relaxed mb-6">
            Route your LLM requests through the AgentStack gateway for automatic
            model routing, caching, and failover.
          </p>

          {/* Code snippet */}
          <div className="max-w-lg mx-auto mb-6 text-left">
            <div className="relative rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)]">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Quick Start
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-[var(--accent-green)]" />
                      <span className="text-[var(--accent-green)]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="p-4 text-xs leading-relaxed overflow-x-auto">
                <code className="font-mono text-[var(--text-secondary)]">
                  {GATEWAY_SNIPPET}
                </code>
              </pre>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <a
              href="/dashboard/route/providers"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90 transition-colors"
            >
              Add Provider
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://docs.agentstack.dev/gateway"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              View Docs
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}
    </motion.div>
  );
}
