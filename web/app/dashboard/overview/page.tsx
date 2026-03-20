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
// Mock / fallback data
// ---------------------------------------------------------------------------

const mockStats = {
  total_sessions: 12847,
  active_sessions: 23,
  failure_rate: 4.2,
  total_cost_cents: 284750,
  healing_interventions: 342,
  healing_success_rate: 94.7,
  reliability_score: 95.8,
  avg_cost_cents: 22,
};

const mockRecentSessions: RecentSession[] = [
  { id: "ses_1a2b3c", agent: "Research Agent", status: "completed", duration: 4200, cost: 15, tokens: 8420, time: "2 min ago" },
  { id: "ses_4d5e6f", agent: "Code Review Agent", status: "healed", duration: 12300, cost: 42, tokens: 21500, time: "5 min ago" },
  { id: "ses_7g8h9i", agent: "Support Agent", status: "failed", duration: 1800, cost: 8, tokens: 3200, time: "12 min ago" },
  { id: "ses_0j1k2l", agent: "Research Agent", status: "completed", duration: 3100, cost: 12, tokens: 6300, time: "15 min ago" },
  { id: "ses_3m4n5o", agent: "Data Pipeline Agent", status: "running", duration: 0, cost: 3, tokens: 1200, time: "just now" },
];

const mockSessionsOverTime: ChartPoint[] = [
  { label: "Mar 14", value: 1620 },
  { label: "Mar 15", value: 1840 },
  { label: "Mar 16", value: 1735 },
  { label: "Mar 17", value: 2105 },
  { label: "Mar 18", value: 1950 },
  { label: "Mar 19", value: 2280 },
  { label: "Mar 20", value: 1917 },
];

const mockFailureRateData: ChartPoint[] = [
  { label: "Mar 14", value: 5.8 },
  { label: "Mar 15", value: 5.2 },
  { label: "Mar 16", value: 6.1 },
  { label: "Mar 17", value: 4.7 },
  { label: "Mar 18", value: 4.4 },
  { label: "Mar 19", value: 3.9 },
  { label: "Mar 20", value: 4.2 },
];

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
// Data-fetching hook
// ---------------------------------------------------------------------------

interface DashboardData {
  stats: typeof mockStats;
  recentSessions: RecentSession[];
  sessionsChart: ChartPoint[];
  failureChart: ChartPoint[];
}

type LoadState = "loading" | "loaded" | "error";

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    setUsingMock(false);

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
      const stats = {
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
          : mockRecentSessions;

      const sessionsChart: ChartPoint[] =
        sessionsTimeRes.data && sessionsTimeRes.data.length > 0
          ? sessionsTimeRes.data.map((p) => ({
              label: formatTimestampLabel(p.timestamp),
              value: p.count,
            }))
          : mockSessionsOverTime;

      const failureChart: ChartPoint[] =
        failureRes.data && failureRes.data.length > 0
          ? failureRes.data.map((p) => ({
              label: formatTimestampLabel(p.timestamp),
              value: p.failure_rate * 100, // convert fraction to percentage
            }))
          : mockFailureRateData;

      setData({ stats, recentSessions, sessionsChart, failureChart });
      setLoadState("loaded");
    } catch (err) {
      // Fallback to mock data on any error
      console.warn("[Overview] API fetch failed, falling back to mock data:", err);

      const fallbackData: DashboardData = {
        stats: mockStats,
        recentSessions: mockRecentSessions,
        sessionsChart: mockSessionsOverTime,
        failureChart: mockFailureRateData,
      };

      setData(fallbackData);
      setUsingMock(true);

      if (err instanceof ApiError) {
        setError(`API error (${err.status}): ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to connect to the API server");
      }

      setLoadState("loaded"); // still "loaded" because we have fallback data to display
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loadState, error, usingMock, retry: fetchData };
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
// Page component
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const { data, loadState, error, usingMock, retry } = useDashboardData();

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

  // We always have data at this point (either real or mock fallback)
  const stats = data?.stats ?? mockStats;
  const recentSessions = data?.recentSessions ?? mockRecentSessions;
  const sessionsChart = data?.sessionsChart ?? mockSessionsOverTime;
  const failureChart = data?.failureChart ?? mockFailureRateData;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-5"
    >
      {/* Error banner with retry — shown when using mock fallback */}
      {usingMock && error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[var(--accent-red)]/8 border border-[var(--accent-red)]/20"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-red)] flex-shrink-0" />
            <p className="text-[12px] text-[var(--accent-red)] truncate">
              {error} — showing demo data
            </p>
          </div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--accent-red)] bg-[var(--accent-red)]/10 hover:bg-[var(--accent-red)]/20 border border-[var(--accent-red)]/20 transition-colors flex-shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </motion.div>
      )}

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

      {/* Charts Row */}
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

      {/* Recent Sessions Table */}
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
    </motion.div>
  );
}
