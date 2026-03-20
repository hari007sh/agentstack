"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Info,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { Session } from "@/lib/types";

// ---------------------------------------------------------------------------
// API response shape from GET /v1/sessions
// ---------------------------------------------------------------------------
interface SessionsAPIResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Display type — the Session plus a computed time_ago string
// ---------------------------------------------------------------------------
type DisplaySession = Session & { time_ago: string };

// ---------------------------------------------------------------------------
// Relative-time formatter
// ---------------------------------------------------------------------------
function formatTimeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Map API sessions to display sessions
// ---------------------------------------------------------------------------
function toDisplaySessions(sessions: Session[]): DisplaySession[] {
  return sessions.map((s) => ({
    ...s,
    // Ensure tags is always an array (Go may serialize null as null)
    tags: s.tags ?? [],
    time_ago: formatTimeAgo(s.started_at),
  }));
}

// ---------------------------------------------------------------------------
// Mock data — used as fallback when the backend is unavailable
// ---------------------------------------------------------------------------
const mockSessions: DisplaySession[] = [
  {
    id: "ses_a1b2c3d4",
    org_id: "org_1",
    agent_name: "Research Agent",
    agent_id: "agent_1",
    status: "completed",
    input: "Find papers on transformer architectures",
    output: "Found 12 relevant papers...",
    error: "",
    metadata: {},
    total_tokens: 8420,
    total_cost_cents: 15,
    total_spans: 5,
    duration_ms: 4200,
    has_healing: false,
    tags: ["research"],
    started_at: "2025-03-20T10:00:00Z",
    ended_at: "2025-03-20T10:00:04Z",
    created_at: "2025-03-20T10:00:00Z",
    time_ago: "2 min ago",
  },
  {
    id: "ses_e5f6g7h8",
    org_id: "org_1",
    agent_name: "Code Review Agent",
    agent_id: "agent_2",
    status: "healed",
    input: "Review PR #142",
    output: "Code review completed with healing intervention",
    error: "",
    metadata: {},
    total_tokens: 21500,
    total_cost_cents: 42,
    total_spans: 8,
    duration_ms: 12300,
    has_healing: true,
    tags: ["code-review"],
    started_at: "2025-03-20T09:55:00Z",
    ended_at: "2025-03-20T09:55:12Z",
    created_at: "2025-03-20T09:55:00Z",
    time_ago: "5 min ago",
  },
  {
    id: "ses_i9j0k1l2",
    org_id: "org_1",
    agent_name: "Support Agent",
    agent_id: "agent_3",
    status: "failed",
    input: "Handle ticket #8821",
    output: "",
    error: "Context window exceeded",
    metadata: {},
    total_tokens: 3200,
    total_cost_cents: 8,
    total_spans: 3,
    duration_ms: 1800,
    has_healing: false,
    tags: ["support"],
    started_at: "2025-03-20T09:48:00Z",
    ended_at: "2025-03-20T09:48:01Z",
    created_at: "2025-03-20T09:48:00Z",
    time_ago: "12 min ago",
  },
  {
    id: "ses_m3n4o5p6",
    org_id: "org_1",
    agent_name: "Research Agent",
    agent_id: "agent_1",
    status: "completed",
    input: "Summarize Q4 earnings reports",
    output: "Summary generated successfully",
    error: "",
    metadata: {},
    total_tokens: 6300,
    total_cost_cents: 12,
    total_spans: 4,
    duration_ms: 3100,
    has_healing: false,
    tags: ["research"],
    started_at: "2025-03-20T09:45:00Z",
    ended_at: "2025-03-20T09:45:03Z",
    created_at: "2025-03-20T09:45:00Z",
    time_ago: "15 min ago",
  },
  {
    id: "ses_q7r8s9t0",
    org_id: "org_1",
    agent_name: "Data Pipeline Agent",
    agent_id: "agent_4",
    status: "running",
    input: "Process batch ETL job #44",
    output: "",
    error: "",
    metadata: {},
    total_tokens: 1200,
    total_cost_cents: 3,
    total_spans: 2,
    duration_ms: 0,
    has_healing: false,
    tags: ["data"],
    started_at: "2025-03-20T10:02:00Z",
    ended_at: "",
    created_at: "2025-03-20T10:02:00Z",
    time_ago: "just now",
  },
  {
    id: "ses_u1v2w3x4",
    org_id: "org_1",
    agent_name: "Support Agent",
    agent_id: "agent_3",
    status: "timeout",
    input: "Generate weekly report",
    output: "",
    error: "Operation timed out after 30s",
    metadata: {},
    total_tokens: 4100,
    total_cost_cents: 9,
    total_spans: 3,
    duration_ms: 30000,
    has_healing: false,
    tags: ["support"],
    started_at: "2025-03-20T09:30:00Z",
    ended_at: "2025-03-20T09:30:30Z",
    created_at: "2025-03-20T09:30:00Z",
    time_ago: "30 min ago",
  },
  {
    id: "ses_y5z6a7b8",
    org_id: "org_1",
    agent_name: "Code Review Agent",
    agent_id: "agent_2",
    status: "completed",
    input: "Review PR #139",
    output: "All checks passed",
    error: "",
    metadata: {},
    total_tokens: 15200,
    total_cost_cents: 31,
    total_spans: 6,
    duration_ms: 8400,
    has_healing: false,
    tags: ["code-review"],
    started_at: "2025-03-20T09:20:00Z",
    ended_at: "2025-03-20T09:20:08Z",
    created_at: "2025-03-20T09:20:00Z",
    time_ago: "40 min ago",
  },
  {
    id: "ses_c9d0e1f2",
    org_id: "org_1",
    agent_name: "Research Agent",
    agent_id: "agent_1",
    status: "healed",
    input: "Competitive analysis for product X",
    output: "Analysis complete after loop recovery",
    error: "",
    metadata: {},
    total_tokens: 18700,
    total_cost_cents: 38,
    total_spans: 7,
    duration_ms: 14200,
    has_healing: true,
    tags: ["research"],
    started_at: "2025-03-20T09:10:00Z",
    ended_at: "2025-03-20T09:10:14Z",
    created_at: "2025-03-20T09:10:00Z",
    time_ago: "50 min ago",
  },
];

const statusConfig: Record<
  string,
  { color: string; bgClass: string; dotClass: string }
> = {
  completed: {
    color: "var(--accent-green)",
    bgClass:
      "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20",
    dotClass: "",
  },
  failed: {
    color: "var(--accent-red)",
    bgClass:
      "bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20",
    dotClass: "status-failed",
  },
  running: {
    color: "var(--accent-blue)",
    bgClass:
      "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20",
    dotClass: "animate-pulse",
  },
  timeout: {
    color: "var(--accent-amber)",
    bgClass:
      "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border border-[var(--accent-amber)]/20",
    dotClass: "",
  },
  healed: {
    color: "var(--healing-blue)",
    bgClass:
      "bg-[var(--healing-blue)]/10 text-[var(--healing-blue)] border border-[var(--healing-blue)]/20",
    dotClass: "status-healed",
  },
};

function formatDuration(ms: number): string {
  if (ms === 0) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

export default function SessionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DisplaySession[]>([]);
  const [usingMockData, setUsingMockData] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const pageSize = 10;

  // Abort controller ref so we can cancel in-flight requests on unmount / re-fetch
  const abortRef = useRef<AbortController | null>(null);

  const fetchSessions = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setFetchError(null);
    setUsingMockData(false);

    try {
      // Ensure the API client has the JWT token from localStorage
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (token) {
        api.setToken(token);
      }

      // Call the real backend: GET /v1/sessions
      // The /v1 routes use API key auth. The JWT token stored in localStorage
      // is set as a Bearer token. If the backend rejects it (no valid API key
      // session), we gracefully fall back to mock data below.
      const data = await api.get<SessionsAPIResponse>("/v1/sessions?limit=200");

      // If the component unmounted or a newer fetch started, bail out
      if (controller.signal.aborted) return;

      const displaySessions = toDisplaySessions(data.sessions);
      setSessions(displaySessions);
      setLoading(false);
    } catch (err) {
      // If aborted (unmount / newer fetch), do nothing
      if (controller.signal.aborted) return;

      const message =
        err instanceof ApiError
          ? `${err.message} (${err.code})`
          : err instanceof Error
            ? err.message
            : "Failed to load sessions";

      console.warn(
        `[AgentStack] ${new Date().toISOString()} SessionsPage: API fetch failed, falling back to mock data. Reason: ${message}`
      );

      // FALLBACK: use mock data so the page still renders during development
      setSessions(mockSessions);
      setUsingMockData(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSessions]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSessions().finally(() => {
      setTimeout(() => setRefreshing(false), 400);
    });
  };

  const filtered = sessions.filter((s) => {
    const matchesSearch =
      search === "" ||
      s.agent_name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const isEmpty = !loading && !fetchError && filtered.length === 0;
  const isEmptyState = !loading && !fetchError && sessions.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Sessions</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Browse and inspect agent execution sessions
        </p>
      </div>

      {/* Mock data indicator — shown when the API is unreachable and we fell back */}
      {usingMockData && !loading && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/5 text-xs text-[var(--accent-amber)]">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Showing mock data — the backend API is not reachable.{" "}
            <button
              onClick={handleRefresh}
              className="underline underline-offset-2 hover:text-[var(--text-primary)] transition-colors"
            >
              Retry
            </button>
          </span>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <Input
              placeholder="Search by agent name or session ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-sm"
            />
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </motion.button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "completed", "failed", "running", "timeout", "healed"].map(
            (status) => {
              const isActive = statusFilter === status;
              const config = status !== "all" ? statusConfig[status] : null;
              return (
                <button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 capitalize ${
                    isActive
                      ? status === "all"
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                        : config?.bgClass || ""
                      : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {status !== "all" && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                      style={{
                        backgroundColor: config?.color,
                      }}
                    />
                  )}
                  {status}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && <SkeletonTable rows={6} cols={7} />}

      {/* Error State */}
      {fetchError && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--bg-elevated)] p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-red)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-red)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">Failed to load sessions</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            {fetchError}
          </p>
          <Button
            onClick={fetchSessions}
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
      {isEmptyState && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No sessions yet</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Start sending traces from your agents using the AgentStack SDK to
            see sessions here.
          </p>
        </div>
      )}

      {/* No Results */}
      {isEmpty && !isEmptyState && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <Search className="w-6 h-6 text-[var(--text-tertiary)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No matching sessions</h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !fetchError && paginated.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {[
                    "Session",
                    "Agent",
                    "Status",
                    "Duration",
                    "Tokens",
                    "Cost",
                    "Time",
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
                {paginated.map((session) => {
                  const sc = statusConfig[session.status] || statusConfig.completed;
                  return (
                    <motion.tr
                      key={session.id}
                      variants={staggerItem}
                      onClick={() =>
                        router.push(`/dashboard/sessions/${session.id}`)
                      }
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs text-[var(--text-secondary)] group-hover:text-[var(--accent-blue)] transition-colors">
                          {session.id}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm">{session.agent_name}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium capitalize ${sc.bgClass}`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${sc.dotClass}`}
                            style={{ backgroundColor: sc.color }}
                          />
                          {session.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] tabular-nums">
                        {formatDuration(session.duration_ms)}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] tabular-nums">
                        {formatTokens(session.total_tokens)}
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)] tabular-nums">
                        {formatCost(session.total_cost_cents)}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                        {session.time_ago}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)]">
            <p className="text-xs text-[var(--text-tertiary)]">
              Showing {(currentPage - 1) * pageSize + 1}
              {"\u2013"}
              {Math.min(currentPage * pageSize, filtered.length)} of{" "}
              {filtered.length} sessions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.max(1, p - 1))
                }
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === i + 1
                        ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/20"
                        : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-secondary)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-default)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
