"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FlaskConical,
  Clock,
  Target,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock, SkeletonTable } from "@/components/skeleton";

// --- Mock Data ---
const mockRun = {
  id: "run_001",
  suite_name: "Research Agent Quality",
  suite_id: "suite_1",
  status: "completed",
  started_at: "2025-03-20T09:48:00Z",
  duration_ms: 45200,
  total_cases: 19,
  passed: 18,
  failed: 1,
  errors: 0,
  overall_score: 92.4,
};

interface EvaluatorResult {
  name: string;
  score: number;
  passed: boolean;
  reason: string;
}

interface CaseResult {
  id: string;
  case_name: string;
  status: "passed" | "failed" | "error";
  score: number;
  evaluators: EvaluatorResult[];
}

const mockResults: CaseResult[] = [
  {
    id: "res_001",
    case_name: "Simple paper search",
    status: "passed",
    score: 95.0,
    evaluators: [
      { name: "relevance", score: 96, passed: true, reason: "All returned papers are highly relevant to the query topic." },
      { name: "faithfulness", score: 94, passed: true, reason: "Citations are accurate and claims are grounded in source material." },
    ],
  },
  {
    id: "res_002",
    case_name: "Multi-topic synthesis",
    status: "passed",
    score: 91.3,
    evaluators: [
      { name: "relevance", score: 92, passed: true, reason: "Synthesis covers all requested topics with appropriate depth." },
      { name: "coherence", score: 93, passed: true, reason: "Well-structured response with logical flow between sections." },
      { name: "completeness", score: 89, passed: true, reason: "Covers most major themes but misses one minor subtopic." },
    ],
  },
  {
    id: "res_003",
    case_name: "Citation accuracy",
    status: "failed",
    score: 62.5,
    evaluators: [
      { name: "faithfulness", score: 45, passed: false, reason: "2 out of 8 citations reference non-existent papers. DOI validation failed." },
      { name: "hallucination", score: 80, passed: true, reason: "Most content is grounded, but fabricated citations are a concern." },
    ],
  },
  {
    id: "res_004",
    case_name: "Edge case: no results",
    status: "passed",
    score: 97.0,
    evaluators: [
      { name: "relevance", score: 98, passed: true, reason: "Correctly identifies that no relevant results exist for the query." },
      { name: "toxicity", score: 96, passed: true, reason: "Response is professional and helpful without any toxic language." },
    ],
  },
  {
    id: "res_005",
    case_name: "Long-form summary",
    status: "passed",
    score: 93.7,
    evaluators: [
      { name: "coherence", score: 95, passed: true, reason: "Excellent structure with clear headings and logical progression." },
      { name: "completeness", score: 91, passed: true, reason: "Covers all key findings from the source papers." },
      { name: "length", score: 95, passed: true, reason: "Response length is within the expected range (800-1200 words)." },
    ],
  },
];

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  passed: { icon: CheckCircle2, color: "var(--accent-green)", label: "Passed" },
  failed: { icon: XCircle, color: "var(--accent-red)", label: "Failed" },
  error: { icon: AlertCircle, color: "var(--accent-amber)", label: "Error" },
};

function formatDuration(ms: number): string {
  if (ms === 0) return "\u2014";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function RunDetailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const passedPct = (mockRun.passed / mockRun.total_cases) * 100;
  const failedPct = (mockRun.failed / mockRun.total_cases) * 100;
  const errorPct = (mockRun.errors / mockRun.total_cases) * 100;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/dashboard/test")}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Tests
      </button>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-6 w-48 mb-4" />
            <SkeletonBlock className="h-4 w-full mb-3" />
            <div className="flex gap-6">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          </div>
          <SkeletonTable rows={5} cols={4} />
        </div>
      )}

      {!loading && (
        <>
          {/* Run Summary */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <h1 className="text-lg font-semibold mb-4">
              Run for {mockRun.suite_name}
            </h1>

            {/* Progress Bar */}
            <div className="mb-5">
              <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-[var(--bg-hover)]">
                {passedPct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${passedPct}%`,
                      backgroundColor: "var(--accent-green)",
                    }}
                  />
                )}
                {failedPct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${failedPct}%`,
                      backgroundColor: "var(--accent-red)",
                    }}
                  />
                )}
                {errorPct > 0 && (
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${errorPct}%`,
                      backgroundColor: "var(--accent-amber)",
                    }}
                  />
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
                  {mockRun.passed} passed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-red)]" />
                  {mockRun.failed} failed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-amber)]" />
                  {mockRun.errors} error
                </span>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Suite
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                  {mockRun.suite_name}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Started
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  {new Date(mockRun.started_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Duration
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formatDuration(mockRun.duration_ms)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1">
                  Overall Score
                </p>
                <p className="text-sm flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                  <span
                    style={{
                      color:
                        mockRun.overall_score >= 90
                          ? "var(--accent-green)"
                          : mockRun.overall_score >= 70
                          ? "var(--accent-amber)"
                          : "var(--accent-red)",
                    }}
                  >
                    {mockRun.overall_score.toFixed(1)}%
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Results Table */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">Test Results</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {["Case Name", "Status", "Score", "Evaluators"].map(
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
                  {mockResults.map((result) => {
                    const sc = statusConfig[result.status];
                    const StatusIcon = sc.icon;
                    const isExpanded = expandedRow === result.id;

                    return (
                      <motion.tr
                        key={result.id}
                        variants={staggerItem}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : result.id)
                        }
                      >
                        <td className="px-5 py-3" colSpan={4}>
                          <div className="flex items-center">
                            <div className="flex-1 min-w-0 flex items-center gap-3">
                              <span className="text-sm font-medium flex-shrink-0 w-48">
                                {result.case_name}
                              </span>
                              <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
                                <StatusIcon
                                  className="w-3.5 h-3.5"
                                  style={{ color: sc.color }}
                                />
                                <span
                                  className="text-xs"
                                  style={{ color: sc.color }}
                                >
                                  {sc.label}
                                </span>
                              </div>
                              <span
                                className="text-sm flex-shrink-0 w-16"
                                style={{
                                  color:
                                    result.score >= 90
                                      ? "var(--accent-green)"
                                      : result.score >= 70
                                      ? "var(--accent-amber)"
                                      : "var(--accent-red)",
                                }}
                              >
                                {result.score.toFixed(1)}%
                              </span>
                              <span className="text-xs text-[var(--text-tertiary)] flex-1">
                                {result.evaluators.length} evaluator
                                {result.evaluators.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
                            )}
                          </div>

                          {/* Expanded Evaluator Details */}
                          {isExpanded && (
                            <div className="mt-3 ml-0 space-y-2">
                              {result.evaluators.map((ev) => (
                                <div
                                  key={ev.name}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      {ev.passed ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                                      ) : (
                                        <XCircle className="w-3.5 h-3.5 text-[var(--accent-red)]" />
                                      )}
                                      <span className="text-sm font-medium capitalize">
                                        {ev.name}
                                      </span>
                                    </div>
                                    <span
                                      className="text-sm font-medium"
                                      style={{
                                        color: ev.passed
                                          ? "var(--accent-green)"
                                          : "var(--accent-red)",
                                      }}
                                    >
                                      {ev.score}%
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--text-secondary)] ml-5">
                                    {ev.reason}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
