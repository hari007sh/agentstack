"use client";

import { motion, useInView, type Variants } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import {
  Shield,
  Activity,
  FlaskConical,
  ShieldCheck,
  Route,
  DollarSign,
  Check,
  Minus,
  ArrowRight,
  Github,
  Zap,
  Lock,
  Globe,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" as const } },
};

/* ------------------------------------------------------------------ */
/*  Section wrapper with whileInView                                   */
/* ------------------------------------------------------------------ */

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const modules = [
  {
    icon: Shield,
    title: "Self-Healing",
    tag: "Shield",
    description: "Auto-fix loops, hallucinations, cost overruns, and timeouts before they impact users.",
    color: "#38bdf8",
  },
  {
    icon: Activity,
    title: "Observability",
    tag: "Trace",
    description: "Session replay, distributed tracing, failure pattern detection, and real-time alerts.",
    color: "#3b82f6",
  },
  {
    icon: FlaskConical,
    title: "Evaluation",
    tag: "Test",
    description: "15+ evaluators, CI/CD quality gates, regression tests, and auto-generated test cases.",
    color: "#a855f7",
  },
  {
    icon: ShieldCheck,
    title: "Guardrails",
    tag: "Guard",
    description: "PII detection, toxicity filtering, prompt injection prevention, and custom policies.",
    color: "#22c55e",
  },
  {
    icon: Route,
    title: "Gateway",
    tag: "Route",
    description: "Model routing, provider failover, semantic caching, and load balancing with <5ms overhead.",
    color: "#f59e0b",
  },
  {
    icon: DollarSign,
    title: "Intelligence",
    tag: "Cost",
    description: "Per-outcome cost tracking, budget enforcement, model comparison, and spend optimization.",
    color: "#ef4444",
  },
];

const comparisonFeatures = [
  "Observability",
  "Self-Healing",
  "Testing",
  "Guardrails",
  "Gateway",
  "Cost Tracking",
];

type Support = "full" | "partial" | "none";

const competitors: { name: string; support: Support[] }[] = [
  { name: "AgentStack", support: ["full", "full", "full", "full", "full", "full"] },
  { name: "Langfuse", support: ["full", "none", "partial", "none", "none", "partial"] },
  { name: "DeepEval", support: ["none", "none", "full", "none", "none", "none"] },
  { name: "Portkey", support: ["partial", "none", "none", "none", "full", "partial"] },
  { name: "Guardrails AI", support: ["none", "none", "none", "full", "none", "none"] },
];

const pricingTiers = [
  {
    name: "Self-Hosted",
    price: "Free",
    period: "forever",
    description: "Open-source, all features, your infrastructure",
    features: ["All 6 modules", "Unlimited events", "Unlimited retention", "Community support", "Docker Compose deploy"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Cloud",
    price: "$49",
    period: "/mo",
    description: "Managed hosting so you can focus on building",
    features: ["All 6 modules", "100K events/mo", "30-day retention", "3 team members", "Email support"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Team",
    price: "$199",
    period: "/mo",
    description: "For teams shipping agents at scale",
    features: ["All 6 modules", "1M events/mo", "90-day retention", "10 team members", "Priority support"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Unlimited scale with dedicated support",
    features: ["All 6 modules", "Unlimited events", "Unlimited retention", "SSO / SAML", "SLA & on-prem deploy"],
    cta: "Contact Sales",
    highlighted: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Comparison cell                                                    */
/* ------------------------------------------------------------------ */

function SupportCell({ support }: { support: Support }) {
  if (support === "full") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-[var(--accent-green)]/15 flex items-center justify-center">
          <Check className="w-3 h-3 text-[var(--accent-green)]" />
        </div>
      </div>
    );
  }
  if (support === "partial") {
    return (
      <div className="flex items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-[var(--accent-amber)]/15 flex items-center justify-center">
          <Minus className="w-3 h-3 text-[var(--accent-amber)]" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center">
      <div className="w-5 h-5 rounded-full bg-[var(--bg-hover)] flex items-center justify-center">
        <Minus className="w-3 h-3 text-[var(--text-tertiary)]" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] overflow-hidden">
      {/* ============================================================ */}
      {/*  NAV                                                         */}
      {/* ============================================================ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[var(--accent-blue)] flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-semibold text-sm text-[var(--text-primary)]">AgentStack</span>
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#modules" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Modules
            </a>
            <a href="#compare" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Compare
            </a>
            <a href="#pricing" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              Pricing
            </a>
            <a
              href="http://localhost:3001/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Docs
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:bg-[var(--accent-blue)]/90 transition-colors"
            >
              Get Started
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <div className="relative pt-32 pb-20 md:pt-44 md:pb-32">
        {/* Grid background */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent-blue)]/[0.07] blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-1/4 w-[400px] h-[400px] rounded-full bg-[var(--accent-purple)]/[0.05] blur-[100px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] text-xs text-[var(--text-secondary)] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)] animate-pulse" />
              Open Source &mdash; Apache 2.0
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.1]"
          >
            The open-source platform for{" "}
            <span className="bg-gradient-to-r from-[var(--accent-blue)] via-[var(--accent-purple)] to-[var(--healing-blue)] bg-clip-text text-transparent">
              AI agents
            </span>{" "}
            in production
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-6 text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed"
          >
            Replace 5 tools with one. Monitor, heal, test, guard, route, and optimize your AI agents.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/login"
              className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-[var(--accent-blue)] text-white font-medium hover:bg-[var(--accent-blue)]/90 transition-all hover:shadow-lg hover:shadow-[var(--accent-blue)]/20"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com/agentstack/agentstack"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-12 px-7 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)] transition-colors"
            >
              <Github className="w-4 h-4" />
              View on GitHub
            </a>
          </motion.div>

          {/* Trust bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[var(--text-tertiary)]"
          >
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> &lt;5ms gateway overhead</span>
            <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> SOC 2 ready</span>
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Self-host or cloud</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Only platform with self-healing</span>
          </motion.div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  6-MODULE GRID                                               */}
      {/* ============================================================ */}
      <Section id="modules" className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-blue)] font-medium mb-3">
            Six Modules, One Platform
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            Everything your agents need
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-xl mx-auto">
            From first deploy to billion-token scale. Each module works standalone or together.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <motion.div
                key={mod.tag}
                variants={fadeUpItem}
                className="group relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 hover:border-[var(--border-default)] transition-all hover:bg-[var(--bg-tertiary)]"
              >
                {/* Accent glow on hover */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${mod.color}08, transparent 60%)`,
                  }}
                />
                <div className="relative">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${mod.color}15` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: mod.color }} />
                  </div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      {mod.title}
                    </h3>
                    <span
                      className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full"
                      style={{
                        color: mod.color,
                        backgroundColor: `${mod.color}12`,
                      }}
                    >
                      {mod.tag}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </Section>

      {/* ============================================================ */}
      {/*  COMPARISON TABLE                                            */}
      {/* ============================================================ */}
      <Section id="compare" className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-purple)] font-medium mb-3">
            Replace Your Stack
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            One platform instead of five
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-xl mx-auto">
            AgentStack is the only platform that covers observability, self-healing, testing, guardrails, gateway, and cost tracking.
          </p>
        </motion.div>

        <motion.div
          variants={scaleIn}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden"
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Feature
                  </th>
                  {competitors.map((c) => (
                    <th
                      key={c.name}
                      className={`px-4 py-4 text-[10px] uppercase tracking-wider font-medium text-center ${
                        c.name === "AgentStack"
                          ? "text-[var(--accent-blue)]"
                          : "text-[var(--text-tertiary)]"
                      }`}
                    >
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature, fi) => (
                  <tr
                    key={feature}
                    className="border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <td className="px-5 py-3.5 text-sm text-[var(--text-primary)]">
                      {feature}
                    </td>
                    {competitors.map((c) => (
                      <td key={c.name} className="px-4 py-3.5">
                        <SupportCell support={c.support[fi]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </Section>

      {/* ============================================================ */}
      {/*  PRICING                                                     */}
      {/* ============================================================ */}
      <Section id="pricing" className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <motion.div variants={fadeUp} className="text-center mb-14">
          <p className="text-xs uppercase tracking-widest text-[var(--accent-green)] font-medium mb-3">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">
            Start free, scale as you grow
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] max-w-xl mx-auto">
            Self-host for free forever, or let us handle the infrastructure.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {pricingTiers.map((tier) => (
            <motion.div
              key={tier.name}
              variants={fadeUpItem}
              className={`relative rounded-xl border p-6 flex flex-col ${
                tier.highlighted
                  ? "border-[var(--accent-blue)] bg-[var(--bg-elevated)] shadow-lg shadow-[var(--accent-blue)]/5"
                  : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-semibold uppercase tracking-wider">
                  Popular
                </div>
              )}
              <div className="mb-4">
                <h3 className="text-sm font-medium text-[var(--text-secondary)]">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-3xl font-bold text-[var(--text-primary)]">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-[var(--text-tertiary)]">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-2">
                  {tier.description}
                </p>
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="w-3.5 h-3.5 text-[var(--accent-green)] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={tier.name === "Enterprise" ? "#" : "/login"}
                className={`inline-flex items-center justify-center h-10 rounded-lg text-sm font-medium transition-colors ${
                  tier.highlighted
                    ? "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
                    : "border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {tier.cta}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* ============================================================ */}
      {/*  FINAL CTA                                                   */}
      {/* ============================================================ */}
      <Section className="max-w-4xl mx-auto px-6 py-20 md:py-28">
        <motion.div
          variants={fadeUp}
          className="relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-10 md:p-16 text-center overflow-hidden"
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-blue)]/[0.04] via-transparent to-[var(--accent-purple)]/[0.04] pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">
              Ready to ship agents with confidence?
            </h2>
            <p className="mt-4 text-[var(--text-secondary)] max-w-lg mx-auto">
              Join the teams using AgentStack to monitor, heal, test, and optimize their AI agents in production.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-[var(--accent-blue)] text-white font-medium hover:bg-[var(--accent-blue)]/90 transition-all hover:shadow-lg hover:shadow-[var(--accent-blue)]/20"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="https://github.com/agentstack/agentstack"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-12 px-7 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium hover:bg-[var(--bg-hover)] transition-colors"
              >
                <Github className="w-4 h-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        </motion.div>
      </Section>

      {/* ============================================================ */}
      {/*  FOOTER                                                      */}
      {/* ============================================================ */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">
                Product
              </h4>
              <ul className="space-y-2.5">
                {["Self-Healing", "Observability", "Evaluation", "Guardrails", "Gateway", "Cost Intelligence"].map(
                  (item) => (
                    <li key={item}>
                      <a href="#modules" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">
                Developers
              </h4>
              <ul className="space-y-2.5">
                {["Documentation", "Python SDK", "TypeScript SDK", "API Reference", "CLI"].map(
                  (item) => (
                    <li key={item}>
                      <a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">
                Company
              </h4>
              <ul className="space-y-2.5">
                {["About", "Blog", "Careers", "Contact"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-4">
                Legal
              </h4>
              <ul className="space-y-2.5">
                {["Privacy Policy", "Terms of Service", "Security", "License (Apache 2.0)"].map(
                  (item) => (
                    <li key={item}>
                      <a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2.5 mb-4 md:mb-0">
              <div className="w-6 h-6 rounded-md bg-[var(--accent-blue)] flex items-center justify-center">
                <span className="text-white font-bold text-[10px]">A</span>
              </div>
              <span className="text-sm text-[var(--text-tertiary)]">
                AgentStack &copy; {new Date().getFullYear()}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/agentstack/agentstack"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Github className="w-4 h-4" />
              </a>
              <a href="#" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </a>
              <a href="#" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
