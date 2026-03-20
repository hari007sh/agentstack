"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock, SkeletonTable } from "@/components/skeleton";

// --- Mock Data ---
const mockRule = {
  id: "rule_pii",
  name: "PII Detection",
  description:
    "Detects personally identifiable information including SSN, credit card numbers, email addresses, and phone numbers in both input and output content.",
  type: "pii",
  mode: "block" as const,
  apply_to: "both" as const,
  enabled: true,
  priority: 1,
  config: {
    patterns: [
      "SSN (###-##-####)",
      "Credit Card (#### #### #### ####)",
      "Email addresses",
      "Phone numbers (US/International)",
      "Passport numbers",
    ],
    sensitivity: "high",
    redact_output: true,
    allow_partial_match: false,
  },
};

interface RuleEvent {
  id: string;
  time_ago: string;
  content: string;
  type: "input" | "output";
  action: "passed" | "blocked" | "warned";
  latency_ms: number;
}

const mockEvents: RuleEvent[] = [
  {
    id: "re_001",
    time_ago: "30s ago",
    content: "Please provide my SSN: 123-45-6789 and process my application...",
    type: "input",
    action: "blocked",
    latency_ms: 12,
  },
  {
    id: "re_002",
    time_ago: "4 min ago",
    content: "My email is user@example.com and my phone is 555-0123...",
    type: "input",
    action: "blocked",
    latency_ms: 8,
  },
  {
    id: "re_003",
    time_ago: "18 min ago",
    content: "The customer's credit card ending in 4242 was charged...",
    type: "output",
    action: "blocked",
    latency_ms: 15,
  },
  {
    id: "re_004",
    time_ago: "45 min ago",
    content: "Summarize the report findings about market trends...",
    type: "input",
    action: "passed",
    latency_ms: 5,
  },
  {
    id: "re_005",
    time_ago: "1h ago",
    content: "Based on the analysis, revenue grew by 12% in Q4...",
    type: "output",
    action: "passed",
    latency_ms: 6,
  },
];

const actionConfig: Record<string, { color: string; label: string }> = {
  passed: { color: "var(--accent-green)", label: "Passed" },
  blocked: { color: "var(--accent-red)", label: "Blocked" },
  warned: { color: "var(--accent-amber)", label: "Warned" },
};

const modeColors: Record<string, { color: string }> = {
  block: { color: "var(--accent-red)" },
  warn: { color: "var(--accent-amber)" },
  log: { color: "var(--text-tertiary)" },
};

export default function GuardRuleDetailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<null | {
    action: string;
    latency_ms: number;
    details: string;
  }>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  function handleTestRule() {
    if (!testInput.trim()) return;
    // Simulate a test result
    const hasPII = /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/.test(testInput) ||
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(testInput);
    setTestResult({
      action: hasPII ? "blocked" : "passed",
      latency_ms: Math.floor(Math.random() * 15) + 5,
      details: hasPII
        ? "PII detected: content contains personally identifiable information."
        : "No PII detected. Content is safe to proceed.",
    });
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Back Navigation */}
      <button
        onClick={() => router.push("/dashboard/guard")}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Guardrails
      </button>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-6 w-40 mb-3" />
            <SkeletonBlock className="h-4 w-96 mb-4" />
            <div className="flex gap-3">
              <SkeletonBlock className="h-5 w-20" />
              <SkeletonBlock className="h-5 w-20" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <SkeletonBlock className="h-4 w-24 mb-3" />
            <SkeletonBlock className="h-10 w-full mb-3" />
            <SkeletonBlock className="h-9 w-24" />
          </div>
          <SkeletonTable rows={4} cols={5} />
        </div>
      )}

      {!loading && (
        <>
          {/* Rule Config */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-lg font-semibold">{mockRule.name}</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  {mockRule.description}
                </p>
              </div>
              <div
                className={`w-2 h-2 rounded-full mt-2 ${
                  mockRule.enabled ? "" : "opacity-40"
                }`}
                style={{
                  backgroundColor: mockRule.enabled
                    ? "var(--accent-green)"
                    : "var(--text-tertiary)",
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 mb-5">
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
              >
                Type: {mockRule.type}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5"
                style={{
                  borderColor: `color-mix(in srgb, ${modeColors[mockRule.mode].color} 30%, transparent)`,
                  color: modeColors[mockRule.mode].color,
                }}
              >
                Mode: {mockRule.mode}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
              >
                Apply to: {mockRule.apply_to}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs px-2 py-0.5 border-[var(--border-subtle)] text-[var(--text-secondary)]"
              >
                Priority: {mockRule.priority}
              </Badge>
            </div>

            {/* Config JSON */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2">
                Configuration
              </p>
              <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] p-4 overflow-x-auto">
                <pre className="text-xs font-mono text-[var(--text-secondary)] whitespace-pre">
                  {JSON.stringify(mockRule.config, null, 2)}
                </pre>
              </div>
            </div>
          </div>

          {/* Test Rule */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
            <h3 className="text-sm font-medium mb-3">Test Rule</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Enter sample text to test this guardrail against.
            </p>
            <div className="flex gap-3">
              <Input
                placeholder="Enter text to test... e.g. My SSN is 123-45-6789"
                value={testInput}
                onChange={(e) => {
                  setTestInput(e.target.value);
                  setTestResult(null);
                }}
                className="flex-1 bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-sm"
              />
              <button
                onClick={handleTestRule}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98] flex-shrink-0"
              >
                <Play className="w-4 h-4" />
                Test
              </button>
            </div>

            {testResult && (
              <div
                className="mt-4 rounded-lg border p-4"
                style={{
                  borderColor: `color-mix(in srgb, ${actionConfig[testResult.action].color} 30%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${actionConfig[testResult.action].color} 5%, transparent)`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${actionConfig[testResult.action].color} 15%, transparent)`,
                      color: actionConfig[testResult.action].color,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: actionConfig[testResult.action].color,
                      }}
                    />
                    {actionConfig[testResult.action].label}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {testResult.latency_ms}ms
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  {testResult.details}
                </p>
              </div>
            )}
          </div>

          {/* Recent Events for This Rule */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-medium">
                Recent Events for This Rule
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {["Time", "Content", "Type", "Action", "Latency"].map(
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
                  {mockEvents.map((event) => {
                    const ac = actionConfig[event.action];
                    return (
                      <motion.tr
                        key={event.id}
                        variants={staggerItem}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <td className="px-5 py-3 text-xs text-[var(--text-tertiary)] whitespace-nowrap">
                          {event.time_ago}
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)] max-w-xs">
                          <p className="truncate">{event.content}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium uppercase bg-[var(--bg-hover)] text-[var(--text-secondary)]">
                            <Eye className="w-3 h-3" />
                            {event.type}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${ac.color} 12%, transparent)`,
                              color: ac.color,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: ac.color }}
                            />
                            {ac.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                          {event.latency_ms}ms
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
