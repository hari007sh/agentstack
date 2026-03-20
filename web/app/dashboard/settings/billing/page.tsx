"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard,
  Zap,
  ArrowUpRight,
  Check,
  Activity,
  Clock,
  Users,
  TrendingUp,
  Download,
  Edit,
  Mail,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Mock data
const mockPlan = {
  name: "Team" as const,
  price_cents: 19900,
  period: "monthly" as const,
  next_billing: "2026-04-15",
  events_limit: 1000000,
  events_used: 423847,
  retention_days: 90,
  retention_used: 67,
  members_limit: 10,
  members_used: 5,
};

const planColors: Record<string, string> = {
  "Self-Hosted": "bg-zinc-500/10 text-zinc-400",
  Cloud: "bg-blue-500/10 text-blue-400",
  Team: "bg-purple-500/10 text-purple-400",
  Enterprise: "bg-amber-500/10 text-amber-400",
};

type PlanTier = "free" | "cloud" | "team" | "enterprise";

interface PlanInfo {
  name: string;
  price: string;
  period: string;
  features: string[];
  limits: {
    events: string;
    retention: string;
    members: string;
  };
  highlight?: boolean;
  cta: string;
}

const allPlans: Record<PlanTier, PlanInfo> = {
  free: {
    name: "Self-Hosted",
    price: "Free",
    period: "forever",
    features: [
      "All 6 modules",
      "Open-source codebase",
      "Community support",
      "Self-managed infrastructure",
    ],
    limits: { events: "Unlimited", retention: "Unlimited", members: "Unlimited" },
    cta: "Self-Host",
  },
  cloud: {
    name: "Cloud",
    price: "$49",
    period: "/month",
    features: [
      "All 6 modules",
      "Managed hosting",
      "Email support",
      "Automatic updates",
      "99.9% uptime SLA",
    ],
    limits: { events: "100K/mo", retention: "30 days", members: "3" },
    cta: "Downgrade",
  },
  team: {
    name: "Team",
    price: "$199",
    period: "/month",
    features: [
      "All 6 modules",
      "Managed hosting",
      "Priority support",
      "Advanced analytics",
      "Team collaboration",
      "Webhook integrations",
      "99.95% uptime SLA",
    ],
    limits: { events: "1M/mo", retention: "90 days", members: "10" },
    highlight: true,
    cta: "Current Plan",
  },
  enterprise: {
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: [
      "All 6 modules",
      "On-premise deploy",
      "Dedicated SLA",
      "SSO / SAML",
      "Custom integrations",
      "Dedicated support",
      "Audit logs",
      "Data residency",
    ],
    limits: { events: "Unlimited", retention: "Unlimited", members: "Unlimited" },
    cta: "Contact Sales",
  },
};

const invoices = [
  { id: "INV-2026-003", date: "Mar 15, 2026", desc: "Team Plan - Monthly", amount: 19900, status: "Paid" as const },
  { id: "INV-2026-002", date: "Feb 15, 2026", desc: "Team Plan - Monthly", amount: 19900, status: "Paid" as const },
  { id: "INV-2026-001", date: "Jan 15, 2026", desc: "Team Plan - Monthly", amount: 19900, status: "Paid" as const },
  { id: "INV-2025-012", date: "Dec 15, 2025", desc: "Team Plan - Monthly", amount: 19900, status: "Paid" as const },
  { id: "INV-2025-011", date: "Nov 15, 2025", desc: "Team Plan - Monthly", amount: 19900, status: "Paid" as const },
];

function UsageBar({
  label,
  used,
  limit,
  icon: Icon,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number;
  icon: React.ElementType;
  formatValue: (v: number) => string;
}) {
  const percentage = Math.min((used / limit) * 100, 100);
  const isHigh = percentage > 80;
  const isCritical = percentage > 95;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--text-tertiary)]" />
          <span className="text-sm text-[var(--text-primary)]">{label}</span>
        </div>
        <span className="text-sm text-[var(--text-secondary)] tabular-nums">
          {formatValue(used)}{" "}
          <span className="text-[var(--text-tertiary)]">
            / {formatValue(limit)}
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden border border-[var(--border-subtle)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className={`h-full rounded-full ${
            isCritical
              ? "bg-[var(--accent-red)]"
              : isHigh
              ? "bg-[var(--accent-amber)]"
              : "bg-[var(--accent-blue)]"
          }`}
        />
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)]">
        {percentage.toFixed(1)}% used
        {isHigh && !isCritical && " -- approaching limit"}
        {isCritical && " -- near limit, consider upgrading"}
      </p>
    </div>
  );
}

export default function BillingPage() {
  const [showUpdatePayment, setShowUpdatePayment] = useState(false);

  const formatEvents = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return v.toLocaleString();
  };

  const formatDays = (v: number) => `${v} days`;
  const formatMembers = (v: number) => `${v}`;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Billing</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your subscription, payment methods, and invoices
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Current plan card */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--accent-purple)]/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[var(--accent-purple)]" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Current Plan</h2>
                  <Badge
                    className={`${planColors[mockPlan.name]} border-0 text-[10px] uppercase tracking-wider font-semibold`}
                  >
                    {mockPlan.name}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Next billing date:{" "}
                  {new Date(mockPlan.next_billing).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                ${(mockPlan.price_cents / 100).toFixed(0)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">per month</p>
            </div>
          </div>

          {/* Plan features quick list */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
            {allPlans.team.features.map((feature) => (
              <div key={feature} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <Check className="w-3 h-3 text-[var(--accent-green)] flex-shrink-0" />
                {feature}
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Events This Month
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)] tabular-nums">
                {formatEvents(mockPlan.events_used)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Data Retention
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)]">
                {mockPlan.retention_days} days
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Team Members
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)] tabular-nums">
                {mockPlan.members_used} / {mockPlan.members_limit}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Usage section */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-[var(--accent-blue)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Usage</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Current billing period resource consumption
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <UsageBar
              label="Events"
              used={mockPlan.events_used}
              limit={mockPlan.events_limit}
              icon={Activity}
              formatValue={formatEvents}
            />
            <UsageBar
              label="Data Retention"
              used={mockPlan.retention_used}
              limit={mockPlan.retention_days}
              icon={Clock}
              formatValue={formatDays}
            />
            <UsageBar
              label="Team Members"
              used={mockPlan.members_used}
              limit={mockPlan.members_limit}
              icon={Users}
              formatValue={formatMembers}
            />
          </div>
        </motion.div>

        {/* Plan Comparison */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-green)]/10 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-[var(--accent-green)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Compare Plans</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Find the right plan for your team
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(Object.entries(allPlans) as [PlanTier, PlanInfo][]).map(([tier, plan]) => {
              const isCurrent = plan.name === mockPlan.name;
              return (
                <div
                  key={tier}
                  className={`rounded-xl border p-5 flex flex-col ${
                    isCurrent
                      ? "border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/[0.03]"
                      : plan.highlight
                      ? "border-[var(--accent-purple)]/20 bg-[var(--accent-purple)]/[0.02]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  }`}
                >
                  {isCurrent && (
                    <Badge className="w-fit mb-2 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-0 text-[10px] uppercase tracking-wider font-semibold">
                      Current
                    </Badge>
                  )}
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{plan.name}</h3>
                  <div className="mt-2 mb-4">
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{plan.price}</span>
                    {plan.period && (
                      <span className="text-xs text-[var(--text-tertiary)]">{plan.period}</span>
                    )}
                  </div>

                  <div className="space-y-2 mb-4 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">Limits</div>
                    <div className="space-y-1">
                      <p className="text-xs text-[var(--text-secondary)]">
                        <span className="text-[var(--text-tertiary)]">Events:</span> {plan.limits.events}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        <span className="text-[var(--text-tertiary)]">Retention:</span> {plan.limits.retention}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        <span className="text-[var(--text-tertiary)]">Members:</span> {plan.limits.members}
                      </p>
                    </div>

                    <div className="pt-2 space-y-1.5">
                      {plan.features.slice(0, 5).map((f) => (
                        <div key={f} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                          <Check className="w-3 h-3 text-[var(--accent-green)] flex-shrink-0" />
                          {f}
                        </div>
                      ))}
                      {plan.features.length > 5 && (
                        <p className="text-[10px] text-[var(--text-tertiary)]">
                          +{plan.features.length - 5} more features
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    variant={isCurrent ? "outline" : tier === "enterprise" ? "default" : "outline"}
                    size="sm"
                    className="w-full"
                    disabled={isCurrent}
                  >
                    {isCurrent ? (
                      "Current Plan"
                    ) : tier === "enterprise" ? (
                      <span className="flex items-center gap-1.5">
                        Contact Sales
                        <ArrowUpRight className="w-3 h-3" />
                      </span>
                    ) : (
                      plan.cta
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Payment Method */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center">
              <CreditCard className="w-4.5 h-4.5 text-[var(--text-tertiary)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Payment Method</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Card on file for subscription payments
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 rounded bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-center">
                <span className="text-white text-[9px] font-bold tracking-wider">VISA</span>
              </div>
              <div>
                <p className="text-sm text-[var(--text-primary)] font-mono">**** **** **** 4242</p>
                <p className="text-xs text-[var(--text-tertiary)]">Expires 12/2027</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowUpdatePayment(true)}>
              <Edit className="w-3 h-3 mr-1.5" />
              Update
            </Button>
          </div>

          {/* Billing Contact */}
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--text-tertiary)]" />
                <div>
                  <p className="text-sm text-[var(--text-primary)]">Billing Contact</p>
                  <p className="text-xs text-[var(--text-tertiary)]">billing@acme.com</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                <Edit className="w-3 h-3 mr-1.5" />
                Edit
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Invoice History */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--bg-hover)] flex items-center justify-center">
                <CreditCard className="w-4.5 h-4.5 text-[var(--text-tertiary)]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Invoice History</h2>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Past invoices and receipts
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Invoice
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Date
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Description
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Amount
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Receipt
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-5 py-3 text-sm text-[var(--text-primary)] font-mono text-xs">
                      {invoice.id}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-secondary)]">
                      {invoice.date}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-primary)]">
                      {invoice.desc}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-primary)] font-medium tabular-nums">
                      ${(invoice.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge className="bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-0 text-[10px] uppercase tracking-wider font-semibold">
                        {invoice.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end">
                        <button className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      {/* Update Payment Method Dialog */}
      <Dialog open={showUpdatePayment} onOpenChange={setShowUpdatePayment}>
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle>Update Payment Method</DialogTitle>
            <DialogDescription>
              Enter your new card details. Your current card will be replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Card Number
              </label>
              <Input
                placeholder="4242 4242 4242 4242"
                className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Expiry Date
                </label>
                <Input
                  placeholder="MM / YY"
                  className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  CVC
                </label>
                <Input
                  placeholder="123"
                  className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Billing Address
              </label>
              <Input
                placeholder="123 Main St, City, State"
                className="bg-[var(--bg-primary)] border-[var(--border-default)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdatePayment(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowUpdatePayment(false)}>
              Update Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
