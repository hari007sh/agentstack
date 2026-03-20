"use client";

import { motion } from "framer-motion";
import {
  CreditCard,
  Zap,
  ArrowUpRight,
  Check,
  Mail,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { showSuccess } from "@/lib/toast";

// --- Plan tier types ---
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
    cta: "Select",
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
    cta: "Select",
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

// The current deployment is self-hosted (free) since there is no Stripe
// integration. The plan comparison UI is kept as informational.
const CURRENT_PLAN_TIER: PlanTier = "free";
const CURRENT_PLAN_NAME = "Self-Hosted";

const planColors: Record<string, string> = {
  "Self-Hosted": "bg-zinc-500/10 text-zinc-400",
  Cloud: "bg-blue-500/10 text-blue-400",
  Team: "bg-purple-500/10 text-purple-400",
  Enterprise: "bg-amber-500/10 text-amber-400",
};

function handlePlanAction(tier: PlanTier) {
  if (tier === "enterprise") {
    // Open mail client to contact sales
    window.location.href = "mailto:sales@agentstack.dev?subject=AgentStack%20Enterprise%20Inquiry";
    return;
  }
  showSuccess("Contact sales@agentstack.dev to change plans");
}

export default function BillingPage() {
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
          Manage your subscription plan
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
                    className={`${planColors[CURRENT_PLAN_NAME]} border-0 text-[10px] uppercase tracking-wider font-semibold`}
                  >
                    {CURRENT_PLAN_NAME}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Open-source self-hosted deployment
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                Free
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">forever</p>
            </div>
          </div>

          {/* Plan features quick list */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
            {allPlans.free.features.map((feature) => (
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
                Events
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)]">
                Unlimited
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Data Retention
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)]">
                Unlimited
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Team Members
              </p>
              <p className="text-lg font-semibold mt-1 text-[var(--text-primary)]">
                Unlimited
              </p>
            </div>
          </div>
        </motion.div>

        {/* Payment & Invoices — Coming Soon */}
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
                Payment processing coming soon
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 rounded bg-[var(--bg-hover)] flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-[var(--text-tertiary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-secondary)]">No payment method on file</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Self-hosted plans do not require payment
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                showSuccess("Payment processing coming soon")
              }
            >
              Update
            </Button>
          </div>

          {/* Billing Contact */}
          <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[var(--text-tertiary)]" />
                <div>
                  <p className="text-sm text-[var(--text-primary)]">Invoices</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Invoices coming soon</p>
                </div>
              </div>
            </div>
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
              const isCurrent = tier === CURRENT_PLAN_TIER;
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
                    onClick={() => handlePlanAction(tier)}
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
      </motion.div>
    </motion.div>
  );
}
