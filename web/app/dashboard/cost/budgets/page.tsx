"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  Plus,
  AlertTriangle,
  Ban,
  Gauge,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";

// --- Mock Data ---
interface BudgetPolicy {
  id: string;
  name: string;
  scope: "org" | "agent" | "model";
  scope_value: string;
  limit_cents: number;
  current_spend_cents: number;
  period: "daily" | "weekly" | "monthly";
  action: "alert" | "throttle" | "block";
  enabled: boolean;
}

const mockBudgets: BudgetPolicy[] = [
  {
    id: "budget_1",
    name: "Organization Monthly",
    scope: "org",
    scope_value: "Default Org",
    limit_cents: 500000,
    current_spend_cents: 347200,
    period: "monthly",
    action: "alert",
    enabled: true,
  },
  {
    id: "budget_2",
    name: "Code Review Agent Daily",
    scope: "agent",
    scope_value: "Code Review Agent",
    limit_cents: 10000,
    current_spend_cents: 8200,
    period: "daily",
    action: "throttle",
    enabled: true,
  },
  {
    id: "budget_3",
    name: "GPT-4o Weekly",
    scope: "model",
    scope_value: "gpt-4o",
    limit_cents: 100000,
    current_spend_cents: 42800,
    period: "weekly",
    action: "block",
    enabled: true,
  },
  {
    id: "budget_4",
    name: "Research Agent Monthly",
    scope: "agent",
    scope_value: "Research Agent",
    limit_cents: 150000,
    current_spend_cents: 67500,
    period: "monthly",
    action: "alert",
    enabled: true,
  },
  {
    id: "budget_5",
    name: "Support Agent Daily",
    scope: "agent",
    scope_value: "Support Agent",
    limit_cents: 5000,
    current_spend_cents: 1200,
    period: "daily",
    action: "throttle",
    enabled: false,
  },
];

const actionConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  alert: { icon: AlertTriangle, color: "var(--accent-amber)", label: "Alert" },
  throttle: { icon: Gauge, color: "var(--accent-purple)", label: "Throttle" },
  block: { icon: Ban, color: "var(--accent-red)", label: "Block" },
};

function formatCost(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getProgressColor(pct: number): string {
  if (pct >= 80) return "var(--accent-red)";
  if (pct >= 60) return "var(--accent-amber)";
  return "var(--accent-green)";
}

export default function BudgetsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockBudgets.length === 0;

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
          <h1 className="text-xl font-semibold">Budget Policies</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Set spending limits and enforce budget controls across agents and
            models
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
          <Plus className="w-4 h-4" />
          Create Budget
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonBlock className="h-5 w-16" />
              </div>
              <SkeletonBlock className="h-3 w-full mb-3" />
              <div className="flex gap-4">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-6 h-6 text-[var(--accent-amber)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No budgets configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Create budget policies to control spending and prevent cost overruns.
          </p>
        </div>
      )}

      {/* Budget Cards */}
      {!loading && mockBudgets.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {mockBudgets.map((budget) => {
            const pct = Math.min(
              (budget.current_spend_cents / budget.limit_cents) * 100,
              100
            );
            const progressColor = getProgressColor(pct);
            const ac = actionConfig[budget.action];
            const ActionIcon = ac.icon;

            return (
              <motion.div
                key={budget.id}
                variants={staggerItem}
                className={`rounded-xl border bg-[var(--bg-elevated)] p-5 hover:border-[var(--border-default)] transition-colors cursor-pointer ${
                  budget.enabled
                    ? "border-[var(--border-subtle)]"
                    : "border-[var(--border-subtle)] opacity-60"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium">{budget.name}</h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {budget.scope_value}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 capitalize border-[var(--border-subtle)] text-[var(--text-secondary)]"
                    >
                      {budget.scope}
                    </Badge>
                    {!budget.enabled && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                      >
                        Disabled
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[var(--text-secondary)]">
                      {formatCost(budget.current_spend_cents)} of{" "}
                      {formatCost(budget.limit_cents)}
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: progressColor }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: progressColor,
                      }}
                    />
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex items-center gap-4 pt-3 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                    <span className="text-[var(--text-tertiary)]">Period:</span>
                    <span className="capitalize">{budget.period}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <ActionIcon
                      className="w-3 h-3"
                      style={{ color: ac.color }}
                    />
                    <span style={{ color: ac.color }}>{ac.label}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
