"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Fingerprint,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import type { FailurePattern } from "@/lib/types";

// --- Mock Data ---
const mockPatterns: (FailurePattern & {
  detection_count: number;
})[] = [
  {
    id: "pat_1",
    name: "Infinite Tool Loop",
    description: "Agent calls the same tool more than 5 times consecutively without progress",
    category: "loop",
    severity: "high",
    is_builtin: true,
    enabled: true,
    detection_count: 142,
  },
  {
    id: "pat_2",
    name: "Hallucinated API Endpoint",
    description: "Agent references an API endpoint that does not exist in the tool schema",
    category: "hallucination",
    severity: "critical",
    is_builtin: true,
    enabled: true,
    detection_count: 87,
  },
  {
    id: "pat_3",
    name: "LLM Response Timeout",
    description: "LLM provider response exceeds configured timeout threshold",
    category: "timeout",
    severity: "medium",
    is_builtin: true,
    enabled: true,
    detection_count: 231,
  },
  {
    id: "pat_4",
    name: "Context Window Overflow",
    description: "Input tokens exceed the model context window limit",
    category: "error",
    severity: "high",
    is_builtin: true,
    enabled: true,
    detection_count: 56,
  },
  {
    id: "pat_5",
    name: "Cost Spike Detection",
    description: "Session cost exceeds 3x the average cost for that agent type",
    category: "cost",
    severity: "medium",
    is_builtin: true,
    enabled: true,
    detection_count: 34,
  },
  {
    id: "pat_6",
    name: "Planning Loop",
    description: "Agent re-enters planning phase more than 3 times without executing",
    category: "loop",
    severity: "high",
    is_builtin: true,
    enabled: true,
    detection_count: 78,
  },
  {
    id: "pat_7",
    name: "Fabricated Citation",
    description: "Agent generates academic citations that do not match any known publication",
    category: "hallucination",
    severity: "critical",
    is_builtin: true,
    enabled: false,
    detection_count: 23,
  },
  {
    id: "pat_8",
    name: "Provider Rate Limit",
    description: "LLM provider returns 429 rate limit error",
    category: "error",
    severity: "low",
    is_builtin: true,
    enabled: true,
    detection_count: 445,
  },
  {
    id: "pat_9",
    name: "Batch Processing Timeout",
    description: "Batch job does not complete within the configured time window",
    category: "timeout",
    severity: "medium",
    is_builtin: false,
    enabled: true,
    detection_count: 12,
  },
  {
    id: "pat_10",
    name: "Budget Threshold Breach",
    description: "Agent session approaches or exceeds the daily budget limit",
    category: "cost",
    severity: "high",
    is_builtin: true,
    enabled: true,
    detection_count: 8,
  },
];

const categoryColors: Record<string, string> = {
  loop: "var(--accent-blue)",
  hallucination: "var(--accent-purple)",
  timeout: "var(--accent-amber)",
  error: "var(--accent-red)",
  cost: "var(--accent-green)",
};

const severityColors: Record<string, string> = {
  low: "var(--text-tertiary)",
  medium: "var(--accent-amber)",
  high: "var(--accent-red)",
  critical: "var(--accent-red)",
};

export default function PatternsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockPatterns.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Failure Patterns</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Detection rules for common agent failure modes
        </p>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={8} cols={6} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
            <Fingerprint className="w-6 h-6 text-[var(--accent-purple)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No patterns configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Failure patterns help detect common agent issues automatically. Seed
            patterns will be loaded on first run.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && mockPatterns.length > 0 && (
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
                    "Name",
                    "Category",
                    "Severity",
                    "Enabled",
                    "Detections",
                    "Type",
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
                {mockPatterns.map((pattern) => {
                  const catColor =
                    categoryColors[pattern.category] || "var(--text-tertiary)";
                  const sevColor =
                    severityColors[pattern.severity] || "var(--text-tertiary)";

                  return (
                    <motion.tr
                      key={pattern.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium">{pattern.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 max-w-md truncate">
                            {pattern.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                            color: catColor,
                          }}
                        >
                          {pattern.category}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${sevColor} 12%, transparent)`,
                            color: sevColor,
                          }}
                        >
                          {pattern.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div
                          className={`w-8 h-5 rounded-full relative transition-colors ${
                            pattern.enabled
                              ? "bg-[var(--accent-green)]"
                              : "bg-[var(--bg-hover)]"
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              pattern.enabled
                                ? "translate-x-3.5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {pattern.detection_count.toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {pattern.is_builtin ? "Built-in" : "Custom"}
                        </span>
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
