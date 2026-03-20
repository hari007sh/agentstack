"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Mail,
  MessageSquare,
  Webhook,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import type { AlertRule } from "@/lib/types";

// --- Mock Data ---
const mockAlerts: (AlertRule & {
  channels: string[];
  condition_details: string;
})[] = [
  {
    id: "alert_1",
    name: "High Failure Rate",
    description: "Triggers when failure rate exceeds 10% in a 5-minute window",
    condition_type: "failure_rate",
    enabled: true,
    last_triggered_at: "2025-03-20T08:15:00Z",
    channels: ["email", "slack"],
    condition_details: "failure_rate > 10% (5m window)",
  },
  {
    id: "alert_2",
    name: "Cost Budget Warning",
    description: "Triggers when daily spend exceeds 80% of budget",
    condition_type: "cost_threshold",
    enabled: true,
    last_triggered_at: "2025-03-19T16:30:00Z",
    channels: ["email"],
    condition_details: "daily_spend > 80% of budget",
  },
  {
    id: "alert_3",
    name: "Healing Failure Spike",
    description: "Triggers when healing success rate drops below 80%",
    condition_type: "healing_rate",
    enabled: true,
    last_triggered_at: null,
    channels: ["slack", "webhook"],
    condition_details: "healing_success_rate < 80%",
  },
  {
    id: "alert_4",
    name: "Agent Latency",
    description: "Triggers when average session duration exceeds 30 seconds",
    condition_type: "latency",
    enabled: false,
    last_triggered_at: "2025-03-18T12:00:00Z",
    channels: ["slack"],
    condition_details: "avg_duration > 30s",
  },
  {
    id: "alert_5",
    name: "Error Pattern Match",
    description: "Triggers when a critical failure pattern is detected 5+ times in 1 hour",
    condition_type: "pattern_match",
    enabled: true,
    last_triggered_at: "2025-03-20T07:45:00Z",
    channels: ["email", "slack", "webhook"],
    condition_details: "critical_pattern_count >= 5 (1h window)",
  },
];

const conditionTypeColors: Record<string, string> = {
  failure_rate: "var(--accent-red)",
  cost_threshold: "var(--accent-amber)",
  healing_rate: "var(--healing-blue)",
  latency: "var(--accent-purple)",
  pattern_match: "var(--accent-blue)",
};

const channelIcons: Record<string, React.ElementType> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
};

function formatLastTriggered(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "Less than 1h ago";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

export default function AlertsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockAlerts.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Alert Rules</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configure alerts for anomalous agent behavior and operational issues
        </p>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={5} />}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-amber)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No alert rules configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Create alert rules to get notified when your agents encounter
            issues.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && mockAlerts.length > 0 && (
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
                    "Condition",
                    "Status",
                    "Last Triggered",
                    "Channels",
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
                {mockAlerts.map((alert) => {
                  const condColor =
                    conditionTypeColors[alert.condition_type] ||
                    "var(--text-tertiary)";

                  return (
                    <motion.tr
                      key={alert.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium">{alert.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {alert.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${condColor} 12%, transparent)`,
                            color: condColor,
                          }}
                        >
                          {alert.condition_type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              alert.enabled ? "" : "opacity-40"
                            }`}
                            style={{
                              backgroundColor: alert.enabled
                                ? "var(--accent-green)"
                                : "var(--text-tertiary)",
                            }}
                          />
                          <span className="text-sm text-[var(--text-secondary)]">
                            {alert.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                        {formatLastTriggered(alert.last_triggered_at)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {alert.channels.map((channel) => {
                            const Icon = channelIcons[channel] || Bell;
                            return (
                              <div
                                key={channel}
                                className="w-7 h-7 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center"
                                title={channel}
                              >
                                <Icon className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                              </div>
                            );
                          })}
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
    </motion.div>
  );
}
