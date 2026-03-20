"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Activity,
  Shield,
  AlertTriangle,
  DollarSign,
  ArrowRight,
  FlaskConical,
  ShieldCheck,
  Eye,
  RefreshCw,
  Rocket,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { ReliabilityScore } from "@/components/reliability-score";
import { AreaChart, LineChart } from "@/components/charts";
import { fadeIn, staggerContainer } from "@/lib/animations";
import { api, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types matching the backend response shapes
// ---------------------------------------------------------------------------

interface OverviewResponse {
  total_sessions: number;
  failed_sessions: number;
  failure_rate: number;
  reliability_score: number;
  avg_cost_cents: number;
  avg_duration_ms: number;
  total_tokens: number;
  total_cost_cents: number;
  healed_sessions: number;
}

interface TimeSeriesPoint {
  timestamp: string;
  count: number;
}

interface FailureRatePoint {
  timestamp: string;
  total: number;
  failed: number;
  failure_rate: number;
}

interface SessionsOverTimeResponse {
  data: TimeSeriesPoint[];
  start: string;
  end: string;
  interval: number;
}

interface FailureRateResponse {
  data: FailureRatePoint[];
  start: string;
  end: string;
  interval: number;
}

interface HealingAnalyticsResponse {
  total_interventions: number;
  success_count: number;
  success_rate: number;
}

interface APISession {
  id: string;
  agent_name: string;
  status: "running" | "completed" | "failed" | "timeout" | "healed";
  duration_ms: number;
  total_cost_cents: number;
  total_tokens: number;
  started_at: string;
}

interface SessionsListResponse {
  sessions: APISession[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Chart data point shape expected by our chart components
// ---------------------------------------------------------------------------

interface ChartPoint {
  label: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Normalised session type used by the table
// ---------------------------------------------------------------------------

interface RecentSession {
  id: string;
  agent: string;
  status: "running" | "completed" | "failed" | "timeout" | "healed";
  duration: number;
  cost: number;
  tokens: number;
  time: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestampLabel(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function apiSessionToRecentSession(s: APISession): RecentSession {
  return {
    id: s.id.length > 12 ? s.id.slice(0, 12) : s.id,
    agent: s.agent_name || "Unknown Agent",
    status: s.status,
    duration: s.duration_ms,
    cost: s.total_cost_cents,
    tokens: s.total_tokens,
    time: formatRelativeTime(s.started_at),
  };
}

// Build the time range query params for the last 7 days
function buildTimeRangeParams(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Stats shape
// ---------------------------------------------------------------------------

interface DashboardStats {
  total_sessions: number;
  active_sessions: number;
  failure_rate: number;
  total_cost_cents: number;
  healing_interventions: number;
  healing_success_rate: number;
  reliability_score: number;
  avg_cost_cents: number;
}

// ---------------------------------------------------------------------------
// Data-fetching hook
// ---------------------------------------------------------------------------

interface DashboardData {
  stats: DashboardStats;
  recentSessions: RecentSession[];
  sessionsChart: ChartPoint[];
  failureChart: ChartPoint[];
}

type LoadState = "loading" | "loaded" | "error";

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoadState("loading");
    setError(null);

    // Inject the JWT token from localStorage into the API client
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        api.setToken(token);
      }
    }

    const { start, end } = buildTimeRangeParams();
    // Daily interval = 86400 seconds
    const interval = 86400;

    try {
      // Fire all requests in parallel
      const [overviewRes, sessionsRes, sessionsTimeRes, failureRes, healingRes] =
        await Promise.all([
          api.get<OverviewResponse>(
            `/v1/analytics/overview?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
          ),
          api.get<SessionsListResponse>("/v1/sessions?limit=5"),
          api.get<SessionsOverTimeResponse>(
            `/v1/analytics/sessions-over-time?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&interval=${interval}`
          ),
          api.get<FailureRateResponse>(
            `/v1/analytics/failure-rate?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&interval=${interval}`
          ),
          api.get<HealingAnalyticsResponse>(
            `/v1/analytics/healing?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
          ),
        ]);

      // Transform the API responses into the shapes expected by the UI
      const stats: DashboardStats = {
        total_sessions: overviewRes.total_sessions,
        active_sessions: 0, // not directly available from the overview endpoint
        failure_rate: overviewRes.failure_rate * 100, // backend returns 0-1 fraction
        total_cost_cents: Number(overviewRes.total_cost_cents),
        healing_interventions: healingRes.total_interventions,
        healing_success_rate: healingRes.success_rate * 100,
        reliability_score: overviewRes.reliability_score * 100,
        avg_cost_cents: overviewRes.avg_cost_cents,
      };

      const recentSessions: RecentSession[] =
        sessionsRes.sessions && sessionsRes.sessions.length > 0
          ? sessionsRes.sessions.map(apiSessionToRecentSession)
          : [];

      const sessionsChart: ChartPoint[] =
        sessionsTimeRes.data && sessionsTimeRes.data.length > 0
          ? sessionsTimeRes.data.map((p) => ({
              label: formatTimestampLabel(p.timestamp),
              value: p.count,
            }))
          : [];

      const failureChart: ChartPoint[] =
        failureRes.data && failureRes.data.length > 0
          ? failureRes.data.map((p) => ({
              label: formatTimestampLabel(p.timestamp),
              value: p.failure_rate * 100, // convert fraction to percentage
            }))
          : [];

      setData({ stats, recentSessions, sessionsChart, failureChart });
      setLoadState("loaded");
    } catch (err) {
      console.error("[Overview] API fetch failed:", err);

      if (err instanceof ApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to connect to the API server");
      }

      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loadState, error, retry: fetchData };
}

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  completed: "var(--accent-green)",
  failed: "var(--accent-red)",
  running: "var(--accent-blue)",
  timeout: "var(--accent-amber)",
  healed: "var(--healing-blue)",
};

const statusBadgeClass: Record<string, string> = {
  completed: "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20",
  failed: "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20",
  running: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20",
  timeout: "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20",
  healed: "bg-[var(--healing-blue)]/10 text-[var(--healing-blue)] border border-[var(--healing-blue)]/20",
};

const statusDotClass: Record<string, string> = {
  completed: "",
  failed: "status-failed",
  running: "animate-pulse",
  timeout: "",
  healed: "status-healed",
};

const quickActions = [
  { label: "View Sessions", href: "/dashboard/sessions", icon: Eye },
  { label: "Run Tests", href: "/dashboard/test", icon: FlaskConical },
  { label: "Check Guards", href: "/dashboard/guard", icon: ShieldCheck },
];

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function MetricCardSkeleton({ large = false }: { large?: boolean }) {
  return (
    <div className={`rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] ${large ? "p-6" : "p-4"}`}>
      <div className="skeleton-shimmer h-3 w-24 rounded mb-3" />
      <div className="skeleton-shimmer h-8 w-32 rounded mb-2" />
      <div className="skeleton-shimmer h-3 w-16 rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl glass gradient-border overflow-hidden">
      <div className="relative p-5">
        <div className="relative z-[3]">
          <div className="skeleton-shimmer h-4 w-40 rounded mb-4" />
          <div className="skeleton-shimmer h-[192px] w-full rounded" />
        </div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl glass gradient-border overflow-hidden">
      <div className="relative">
        <div className="relative z-[3]">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)]">
            <div className="skeleton-shimmer h-4 w-32 rounded" />
          </div>
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="skeleton-shimmer h-4 w-20 rounded" />
                <div className="skeleton-shimmer h-4 w-28 rounded" />
                <div className="skeleton-shimmer h-4 w-16 rounded" />
                <div className="skeleton-shimmer h-4 w-14 rounded" />
                <div className="skeleton-shimmer h-4 w-12 rounded" />
                <div className="skeleton-shimmer h-4 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReliabilityScoreSkeleton() {
  return <div className="skeleton-shimmer w-16 h-16 rounded-full" />;
}

// ---------------------------------------------------------------------------
// Copy button helper
// ---------------------------------------------------------------------------

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
        copied
          ? "text-[var(--accent-green)] bg-[var(--accent-green)]/10 border border-[var(--accent-green)]/20"
          : "text-[var(--text-secondary)] bg-[var(--bg-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Empty state: Onboarding card (replaces charts when no data)
// ---------------------------------------------------------------------------

function OnboardingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-8 lg:p-10"
    >
      <div className="flex flex-col items-center text-center max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mb-4">
          <Rocket className="w-6 h-6 text-[var(--accent-blue)]" />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1.5">
          Get started with AgentStack
        </h3>
        <p className="text-[13px] text-[var(--text-secondary)] mb-6">
          Install the SDK and start monitoring your AI agents in minutes.
        </p>

        <div className="w-full rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden mb-5">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
              Install
            </span>
            <CopyButton text={"pip install agentstack\n# or\nnpm install @agentstack/sdk"} />
          </div>
          <pre className="px-4 py-3 text-[12px] leading-relaxed font-mono text-[var(--text-secondary)] text-left overflow-x-auto">
            <code>
              <span className="text-[var(--accent-green)]">pip install</span> agentstack{"\n"}
              <span className="text-[var(--text-tertiary)]"># or</span>{"\n"}
              <span className="text-[var(--accent-green)]">npm install</span> @agentstack/sdk
            </code>
          </pre>
        </div>

        <a
          href="https://docs.agentstack.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--accent-blue)] bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/20 hover:bg-[var(--accent-blue)]/15 transition-colors"
        >
          View Documentation
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty state: Recent sessions (when 0 sessions)
// ---------------------------------------------------------------------------

function EmptyRecentSessions() {
  return (
    <div className="rounded-xl glass gradient-border overflow-hidden">
      <div className="relative">
        <div className="relative z-[3]">
          <div className="px-5 py-3.5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Recent Sessions</h3>
            </div>
          </div>
          <div className="px-5 py-12 flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mb-3">
              <Activity className="w-5 h-5 text-[var(--accent-blue)]" />
            </div>
            <h4 className="text-[13px] font-medium text-[var(--text-primary)] mb-1">
              No sessions yet
            </h4>
            <p className="text-[12px] text-[var(--text-tertiary)] max-w-xs mb-4">
              Sessions will appear here once your agents start running.
            </p>
            <a
              href="https://docs.agentstack.dev/quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-blue)] hover:text-[var(--accent-blue)]/80 transition-colors"
            >
              View Setup Guide
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { data, loadState, error, retry } = useDashboardData();

  // Full loading state: show skeleton layout
  if (loadState === "loading" && !data) {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="space-y-5"
      >
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="skeleton-shimmer h-6 w-32 rounded mb-2" />
            <div className="skeleton-shimmer h-4 w-56 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="skeleton-shimmer h-3 w-16 rounded mb-1" />
              <div className="skeleton-shimmer h-6 w-14 rounded" />
            </div>
            <ReliabilityScoreSkeleton />
          </div>
        </div>

        {/* Metric cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2"><MetricCardSkeleton large /></div>
          <div className="lg:col-span-2"><MetricCardSkeleton large /></div>
          <div className="md:col-span-1 lg:col-span-2"><MetricCardSkeleton /></div>
          <div className="md:col-span-1 lg:col-span-2"><MetricCardSkeleton /></div>
        </div>

        {/* Quick actions skeleton */}
        <div className="flex items-center gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton-shimmer h-8 w-28 rounded-lg" />
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>

        {/* Table skeleton */}
        <TableSkeleton />
      </motion.div>
    );
  }

  // Error state: API failed entirely
  if (loadState === "error") {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="space-y-5"
      >
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Monitor your AI agents in production
          </p>
        </div>

        {/* Error card */}
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">
            Failed to load dashboard
          </h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {error}
          </p>
          <button
            onClick={retry}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-primary)] bg-[var(--bg-hover)] border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </motion.div>
    );
  }

  // We have real data at this point (may be empty, but real)
  const stats = data!.stats;
  const recentSessions = data!.recentSessions;
  const sessionsChart = data!.sessionsChart;
  const failureChart = data!.failureChart;

  const hasNoSessions = stats.total_sessions === 0;
  const hasChartData = sessionsChart.length > 0 || failureChart.length > 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Monitor your AI agents in production
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right mr-2 hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
              Reliability
            </p>
            <p
              className="text-lg font-bold tabular-nums"
              style={{
                background: "linear-gradient(135deg, var(--accent-green), var(--healing-blue))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {stats.reliability_score.toFixed(1)}%
            </p>
          </div>
          <ReliabilityScore score={stats.reliability_score} size={64} />
        </div>
      </div>

      {/* Metric Cards — Bento grid: 2 large on top, 2 smaller below */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="lg:col-span-2">
          <MetricCard
            title="Total Sessions"
            value={stats.total_sessions}
            icon={Activity}
            color="blue"
            size="large"
          />
        </div>
        <div className="lg:col-span-2">
          <MetricCard
            title="Healing Interventions"
            value={stats.healing_interventions}
            icon={Shield}
            color="cyan"
            size="large"
          />
        </div>
        <div className="md:col-span-1 lg:col-span-2">
          <MetricCard
            title="Failure Rate"
            value={stats.failure_rate}
            format="percent"
            icon={AlertTriangle}
            color="red"
          />
        </div>
        <div className="md:col-span-1 lg:col-span-2">
          <MetricCard
            title="Total Cost"
            value={stats.total_cost_cents}
            format="currency"
            icon={DollarSign}
            color="green"
          />
        </div>
      </motion.div>

      {/* Quick Actions Bar */}
      <div className="flex items-center gap-2.5">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 h-8 px-3.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
                <ArrowRight className="w-3 h-3 opacity-40" />
              </motion.button>
            </Link>
          );
        })}
      </div>

      {/* Charts Row OR Onboarding Card */}
      {hasNoSessions || !hasChartData ? (
        <OnboardingCard />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Sessions Over Time Chart */}
          <div className="rounded-xl glass gradient-border overflow-hidden">
            <div className="relative p-5">
              <div className="relative z-[3]">
                <h3 className="text-[13px] font-medium mb-4 text-[var(--text-primary)]">Sessions Over Time</h3>
                <AreaChart
                  data={sessionsChart}
                  color="var(--accent-blue)"
                  gradientId="sessions-area"
                  height={192}
                  formatValue={(v) => v.toLocaleString()}
                />
              </div>
            </div>
          </div>

          {/* Failure Rate Trend Chart */}
          <div className="rounded-xl glass gradient-border overflow-hidden">
            <div className="relative p-5">
              <div className="relative z-[3]">
                <h3 className="text-[13px] font-medium mb-4 text-[var(--text-primary)]">Failure Rate Trend</h3>
                <LineChart
                  data={failureChart}
                  color="var(--accent-red)"
                  height={192}
                  valueSuffix="%"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sessions Table OR Empty State */}
      {recentSessions.length === 0 ? (
        <EmptyRecentSessions />
      ) : (
        <div className="rounded-xl glass gradient-border overflow-hidden">
          <div className="relative">
            <div className="relative z-[3]">
              <div className="px-5 py-3.5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-medium text-[var(--text-primary)]">Recent Sessions</h3>
                  <Link
                    href="/dashboard/sessions"
                    className="text-[11px] text-[var(--accent-blue)] hover:text-[var(--accent-blue)]/80 transition-colors flex items-center gap-1"
                  >
                    View all
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Session
                      </th>
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Agent
                      </th>
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Status
                      </th>
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Duration
                      </th>
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Cost
                      </th>
                      <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((session, index) => (
                      <motion.tr
                        key={session.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.03, duration: 0.25 }}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-2.5">
                          <span className="font-mono text-[11px] text-[var(--text-secondary)] group-hover:text-[var(--accent-blue)] transition-colors tabular-nums">
                            {session.id}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-[13px] text-[var(--text-primary)]">{session.agent}</td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${statusBadgeClass[session.status] || ""}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${statusDotClass[session.status] || ""}`}
                              style={{ backgroundColor: statusColors[session.status] }}
                            />
                            {session.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-[12px] text-[var(--text-secondary)] tabular-nums">
                          {session.duration > 0
                            ? session.duration < 1000
                              ? `${session.duration}ms`
                              : `${(session.duration / 1000).toFixed(1)}s`
                            : "\u2014"}
                        </td>
                        <td className="px-5 py-2.5 text-[12px] text-[var(--text-secondary)] tabular-nums">
                          ${(session.cost / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-2.5 text-[11px] text-[var(--text-tertiary)]">
                          {session.time}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
