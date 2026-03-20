"use client";

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
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { ReliabilityScore } from "@/components/reliability-score";
import { fadeIn, staggerContainer } from "@/lib/animations";

// Mock data for Phase 1 — will be replaced with API calls in Phase 2
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

const mockRecentSessions = [
  { id: "ses_1a2b3c", agent: "Research Agent", status: "completed" as const, duration: 4200, cost: 15, tokens: 8420, time: "2 min ago" },
  { id: "ses_4d5e6f", agent: "Code Review Agent", status: "healed" as const, duration: 12300, cost: 42, tokens: 21500, time: "5 min ago" },
  { id: "ses_7g8h9i", agent: "Support Agent", status: "failed" as const, duration: 1800, cost: 8, tokens: 3200, time: "12 min ago" },
  { id: "ses_0j1k2l", agent: "Research Agent", status: "completed" as const, duration: 3100, cost: 12, tokens: 6300, time: "15 min ago" },
  { id: "ses_3m4n5o", agent: "Data Pipeline Agent", status: "running" as const, duration: 0, cost: 3, tokens: 1200, time: "just now" },
];

const statusColors: Record<string, string> = {
  completed: "var(--accent-green)",
  failed: "var(--accent-red)",
  running: "var(--accent-blue)",
  timeout: "var(--accent-amber)",
  healed: "var(--healing-blue)",
};

const quickActions = [
  { label: "View Sessions", href: "/dashboard/sessions", icon: Eye },
  { label: "Run Tests", href: "/dashboard/test", icon: FlaskConical },
  { label: "Check Guards", href: "/dashboard/guard", icon: ShieldCheck },
];

export default function OverviewPage() {
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
              {mockStats.reliability_score}%
            </p>
          </div>
          <ReliabilityScore score={mockStats.reliability_score} size={64} />
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
            value={mockStats.total_sessions}
            icon={Activity}
            color="blue"
            change={12.5}
            size="large"
          />
        </div>
        <div className="lg:col-span-2">
          <MetricCard
            title="Healing Interventions"
            value={mockStats.healing_interventions}
            icon={Shield}
            color="cyan"
            change={8.3}
            size="large"
          />
        </div>
        <div className="md:col-span-1 lg:col-span-2">
          <MetricCard
            title="Failure Rate"
            value={mockStats.failure_rate}
            format="percent"
            icon={AlertTriangle}
            color="red"
            change={-2.1}
          />
        </div>
        <div className="md:col-span-1 lg:col-span-2">
          <MetricCard
            title="Total Cost"
            value={mockStats.total_cost_cents}
            format="currency"
            icon={DollarSign}
            color="green"
            change={5.7}
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
                className="inline-flex items-center gap-2 h-8 px-3.5 rounded-lg text-[12px] font-medium text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)] transition-colors"
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
        {/* Sessions Over Time Chart Placeholder */}
        <div className="rounded-xl glass gradient-border overflow-hidden">
          <div className="relative p-5">
            <div className="relative z-[3]">
              <h3 className="text-[13px] font-medium mb-4 text-[var(--text-primary)]">Sessions Over Time</h3>
              <div className="h-48 flex items-center justify-center mesh-gradient-1 rounded-lg">
                <p className="text-[var(--text-tertiary)] text-[12px]">
                  Chart will be implemented in Phase 2
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Failure Rate Chart Placeholder */}
        <div className="rounded-xl glass gradient-border overflow-hidden">
          <div className="relative p-5">
            <div className="relative z-[3]">
              <h3 className="text-[13px] font-medium mb-4 text-[var(--text-primary)]">Failure Rate Trend</h3>
              <div className="h-48 flex items-center justify-center mesh-gradient-2 rounded-lg">
                <p className="text-[var(--text-tertiary)] text-[12px]">
                  Chart will be implemented in Phase 2
                </p>
              </div>
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
                  {mockRecentSessions.map((session, index) => (
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
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-1.5 h-1.5 rounded-full ${
                              session.status === "healed" ? "status-healed" :
                              session.status === "failed" ? "status-failed" :
                              session.status === "running" ? "animate-pulse" : ""
                            }`}
                            style={{ backgroundColor: statusColors[session.status] }}
                          />
                          <span className="text-[12px] capitalize text-[var(--text-secondary)]">{session.status}</span>
                        </div>
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
