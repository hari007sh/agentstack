"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FlaskConical,
  Play,
  Target,
  Plus,
  ListChecks,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonMetricCards, SkeletonTable } from "@/components/skeleton";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types matching backend response shapes
// ---------------------------------------------------------------------------

interface TestSuite {
  id: string;
  org_id: string;
  name: string;
  description: string;
  agent_id?: string;
  tags: string[];
  case_count: number;
  created_at: string;
  updated_at: string;
}

interface TestRun {
  id: string;
  org_id: string;
  suite_id: string;
  status: string; // "pending" | "running" | "completed" | "failed"
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  error_cases: number;
  avg_score: number;
  duration_ms: number;
  metadata: unknown;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// Default zero metrics for initial state and empty data
const zeroMetrics = {
  total_suites: 0,
  total_runs: 0,
  pass_rate: 0,
  avg_score: 0,
};

interface DisplayTestRun {
  id: string;
  suite_id: string;
  suite_name: string;
  status: "pending" | "running" | "completed" | "failed";
  passed: number;
  failed: number;
  errors: number;
  avg_score: number;
  duration_ms: number;
  time_ago: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusConfig: Record<string, { color: string; bgClass: string; pulseClass: string }> = {
  pending: {
    color: "var(--text-tertiary)",
    bgClass: "",
    pulseClass: "",
  },
  running: {
    color: "var(--accent-blue)",
    bgClass: "",
    pulseClass: "animate-pulse",
  },
  completed: {
    color: "var(--accent-green)",
    bgClass: "",
    pulseClass: "",
  },
  failed: {
    color: "var(--accent-red)",
    bgClass: "",
    pulseClass: "",
  },
};

function formatDuration(ms: number): string {
  if (ms === 0) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60000) return "just now";
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} min ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
  if (diffMs < 604800000) return `${Math.floor(diffMs / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function TestOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real data state
  const [metrics, setMetrics] = useState(zeroMetrics);
  const [runs, setRuns] = useState<DisplayTestRun[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Set token from localStorage for API auth
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }

    try {
      // Fetch suites and runs in parallel
      const [suitesRes, runsRes] = await Promise.all([
        api.get<{ suites: TestSuite[] }>("/v1/test/suites"),
        api.get<{ runs: TestRun[] }>("/v1/test/runs"),
      ]);

      const suites = suitesRes.suites;
      const apiRuns = runsRes.runs;

      // Build a suite name lookup
      const suiteNameMap: Record<string, string> = {};
      for (const s of suites) {
        suiteNameMap[s.id] = s.name;
      }

      // --- Compute metrics ---
      const totalSuites = suites.length;
      const totalRuns = apiRuns.length;

      const completedRuns = apiRuns.filter((r) => r.status === "completed" || r.status === "failed");
      const totalPassed = completedRuns.reduce((sum, r) => sum + r.passed_cases, 0);
      const totalCases = completedRuns.reduce((sum, r) => sum + r.total_cases, 0);
      const passRate = totalCases > 0 ? (totalPassed / totalCases) * 100 : 0;

      const scoredRuns = completedRuns.filter((r) => r.avg_score > 0);
      const avgScore = scoredRuns.length > 0
        ? scoredRuns.reduce((sum, r) => sum + r.avg_score, 0) / scoredRuns.length
        : 0;

      setMetrics({
        total_suites: totalSuites,
        total_runs: totalRuns,
        pass_rate: Math.round(passRate * 10) / 10,
        avg_score: Math.round(avgScore * 10) / 10,
      });

      // --- Map runs to display format ---
      const displayRuns: DisplayTestRun[] = apiRuns.map((r) => ({
        id: r.id,
        suite_id: r.suite_id,
        suite_name: suiteNameMap[r.suite_id] || r.suite_id,
        status: (["pending", "running", "completed", "failed"].includes(r.status)
          ? r.status
          : "pending") as DisplayTestRun["status"],
        passed: r.passed_cases,
        failed: r.failed_cases,
        errors: r.error_cases,
        avg_score: r.avg_score,
        duration_ms: Number(r.duration_ms),
        time_ago: r.created_at ? timeAgo(r.created_at) : "unknown",
      }));

      setRuns(displayRuns);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to load test data";

      console.error(
        `[AgentStack] ${new Date().toISOString()} TestPage: API call failed. Reason: ${message}`
      );

      setError(message);
      setMetrics(zeroMetrics);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isEmpty = !loading && !error && runs.length === 0;

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
          <h1 className="text-xl font-semibold">Tests</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Evaluate agent quality with automated test suites and scoring
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
          <Plus className="w-4 h-4" />
          New Test Suite
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">Failed to load test data</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {error}
          </p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
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
            title="Total Suites"
            value={metrics.total_suites}
            icon={ListChecks}
            color="blue"
          />
          <MetricCard
            title="Total Runs"
            value={metrics.total_runs}
            icon={Play}
            color="purple"
            change={8.4}
          />
          <MetricCard
            title="Pass Rate"
            value={metrics.pass_rate}
            format="percent"
            icon={Target}
            color="green"
            change={2.3}
          />
          <MetricCard
            title="Avg Score"
            value={metrics.avg_score}
            format="percent"
            icon={FlaskConical}
            color="amber"
            change={1.1}
          />
        </motion.div>
      )}

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={6} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-5">
            <FlaskConical className="w-7 h-7 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)]">
            No test suites yet
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
            Create test suites with evaluators to automatically measure your
            agent&apos;s quality, accuracy, and reliability.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push("/dashboard/test/suites/new")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New Test Suite
            </button>
            <a
              href="https://docs.agentstack.dev/test/evaluators"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-default)] bg-[var(--bg-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              View Evaluators
              <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && !error && runs.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Recent Test Runs</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Suite Name", "Status", "Cases", "Avg Score", "Duration", "Time"].map(
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
                {runs.map((run) => {
                  const sc = statusConfig[run.status] || statusConfig.pending;
                  return (
                    <motion.tr
                      key={run.id}
                      variants={staggerItem}
                      onClick={() => router.push(`/dashboard/test/runs/${run.id}`)}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3 text-sm font-medium">
                        {run.suite_name}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium capitalize ${sc.pulseClass}`}
                          style={{
                            backgroundColor: `color-mix(in srgb, ${sc.color} 12%, transparent)`,
                            color: sc.color,
                          }}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${sc.pulseClass}`}
                            style={{ backgroundColor: sc.color }}
                          />
                          {run.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[var(--accent-green)]">
                            {run.passed} passed
                          </span>
                          {run.failed > 0 && (
                            <span className="text-[var(--accent-red)]">
                              {run.failed} failed
                            </span>
                          )}
                          {run.errors > 0 && (
                            <span className="text-[var(--accent-amber)]">
                              {run.errors} error
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {run.avg_score > 0
                          ? `${run.avg_score.toFixed(1)}%`
                          : "\u2014"}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {formatDuration(run.duration_ms)}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                        {run.time_ago}
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
