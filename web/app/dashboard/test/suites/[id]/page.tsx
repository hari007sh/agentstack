"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  FlaskConical,
  Bot,
  Tag,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock, SkeletonTable } from "@/components/skeleton";

// --- Mock Data ---
const mockSuite = {
  id: "suite_1",
  name: "Research Agent Quality",
  description:
    "End-to-end quality evaluation for the Research Agent, covering search accuracy, citation quality, and response relevance.",
  agent_name: "Research Agent",
  agent_id: "agent_1",
  tags: ["research", "quality", "regression"],
  created_at: "2025-02-15T10:00:00Z",
};

interface TestCase {
  id: string;
  name: string;
  expected_output: string;
  evaluators: string[];
  last_status: "passed" | "failed" | "error" | "not_run";
}

const mockCases: TestCase[] = [
  {
    id: "case_001",
    name: "Simple paper search",
    expected_output:
      "Should return at least 5 relevant papers with proper citations and abstracts from academic databases",
    evaluators: ["relevance", "faithfulness"],
    last_status: "passed",
  },
  {
    id: "case_002",
    name: "Multi-topic synthesis",
    expected_output:
      "Should synthesize findings across multiple papers, identifying common themes and contradictions in the literature",
    evaluators: ["relevance", "coherence", "completeness"],
    last_status: "passed",
  },
  {
    id: "case_003",
    name: "Citation accuracy",
    expected_output:
      "All citations should be real papers with valid DOIs, correct authors, and accurate publication years",
    evaluators: ["faithfulness", "hallucination"],
    last_status: "failed",
  },
  {
    id: "case_004",
    name: "Edge case: no results",
    expected_output:
      "Agent should gracefully handle queries with no results, informing the user and suggesting alternative search terms",
    evaluators: ["relevance", "toxicity"],
    last_status: "passed",
  },
  {
    id: "case_005",
    name: "Long-form summary",
    expected_output:
      "Summary should be comprehensive, well-structured with headings, and cover all key findings from the retrieved papers",
    evaluators: ["coherence", "completeness", "length"],
    last_status: "passed",
  },
  {
    id: "case_006",
    name: "Comparative analysis",
    expected_output:
      "Should accurately compare methodologies, results, and limitations across multiple research papers",
    evaluators: ["relevance", "faithfulness", "completeness"],
    last_status: "not_run",
  },
];

const statusConfig: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  passed: {
    icon: CheckCircle2,
    color: "var(--accent-green)",
    label: "Passed",
  },
  failed: {
    icon: XCircle,
    color: "var(--accent-red)",
    label: "Failed",
  },
  error: {
    icon: AlertCircle,
    color: "var(--accent-amber)",
    label: "Error",
  },
  not_run: {
    icon: Clock,
    color: "var(--text-tertiary)",
    label: "Not Run",
  },
};

export default function SuiteDetailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockCases.length === 0;

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
            <SkeletonBlock className="h-6 w-48 mb-3" />
            <SkeletonBlock className="h-4 w-96 mb-4" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-5 w-20" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          </div>
          <SkeletonTable rows={5} cols={4} />
        </div>
      )}

      {!loading && (
        <>
          {/* Suite Header */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-lg font-semibold">{mockSuite.name}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  {mockSuite.description}
                </p>

                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                    <Bot className="w-3.5 h-3.5 text-[var(--accent-blue)]" />
                    {mockSuite.agent_name}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3 h-3 text-[var(--text-tertiary)]" />
                    {mockSuite.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98] flex-shrink-0">
                <Play className="w-4 h-4" />
                Run Tests
              </button>
            </div>
          </div>

          {/* Empty State */}
          {isEmpty && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
                <FlaskConical className="w-6 h-6 text-[var(--accent-blue)]" />
              </div>
              <h3 className="text-sm font-medium mb-1">No test cases yet</h3>
              <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
                Add test cases to this suite to start evaluating your agent.
              </p>
            </div>
          )}

          {/* Test Cases Table */}
          {mockCases.length > 0 && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-medium">
                  Test Cases ({mockCases.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      {["Name", "Expected Output", "Evaluators", "Last Status"].map(
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
                    {mockCases.map((tc) => {
                      const sc = statusConfig[tc.last_status];
                      const StatusIcon = sc.icon;
                      return (
                        <motion.tr
                          key={tc.id}
                          variants={staggerItem}
                          className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <td className="px-5 py-3 text-sm font-medium">
                            {tc.name}
                          </td>
                          <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs">
                            <p className="truncate">{tc.expected_output}</p>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1">
                              {tc.evaluators.map((ev) => (
                                <Badge
                                  key={ev}
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                >
                                  {ev}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
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
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  );
}
