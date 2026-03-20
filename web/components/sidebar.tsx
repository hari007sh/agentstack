"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Activity,
  Shield,
  Bot,
  BarChart3,
  AlertTriangle,
  FlaskConical,
  ShieldCheck,
  Route,
  DollarSign,
  Settings,
  Key,
  Users,
  CreditCard,
  Fingerprint,
  ChevronLeft,
  Menu,
  FileText,
  Play,
  Database,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard/overview", icon: LayoutDashboard },
    ],
  },
  {
    title: "Observe",
    items: [
      { label: "Sessions", href: "/dashboard/sessions", icon: Activity },
      { label: "Healing", href: "/dashboard/healing", icon: Shield },
      { label: "Agents", href: "/dashboard/agents", icon: Bot },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { label: "Patterns", href: "/dashboard/patterns", icon: Fingerprint },
      { label: "Alerts", href: "/dashboard/alerts", icon: AlertTriangle },
    ],
  },
  {
    title: "Quality",
    items: [
      { label: "Tests", href: "/dashboard/test", icon: FlaskConical },
      { label: "Guardrails", href: "/dashboard/guard", icon: ShieldCheck },
      { label: "Prompts", href: "/dashboard/prompts", icon: FileText },
      { label: "Playground", href: "/dashboard/playground", icon: Play },
      { label: "Datasets", href: "/dashboard/datasets", icon: Database },
    ],
  },
  {
    title: "Infra",
    items: [
      { label: "Gateway", href: "/dashboard/route", icon: Route },
      { label: "Cost", href: "/dashboard/cost", icon: DollarSign },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "General", href: "/dashboard/settings", icon: Settings },
      { label: "API Keys", href: "/dashboard/settings/api-keys", icon: Key },
      { label: "Team", href: "/dashboard/settings/team", icon: Users },
      { label: "Billing", href: "/dashboard/settings/billing", icon: CreditCard },
      { label: "Webhooks", href: "/dashboard/settings/webhooks", icon: Bell },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Menu className="w-5 h-5" />
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar,var(--bg-secondary))] z-40 transition-all duration-200 flex flex-col",
          collapsed ? "w-16" : "w-60",
          "max-lg:hidden"
        )}
      >
        {/* Logo — fixed header */}
        <div className="flex items-center justify-between h-12 px-3 border-b border-[var(--border-subtle)] flex-shrink-0">
          {!collapsed && (
            <Link href="/dashboard/overview" className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center">
                <span className="text-white font-bold text-[11px]">A</span>
              </div>
              <span className="font-semibold text-[13px] text-[var(--text-primary)]">AgentStack</span>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)]"
          >
            <ChevronLeft
              className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        </div>

        {/* Navigation — scrollable middle */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 min-h-0">
          {navigation.map((section, sectionIndex) => (
            <div key={section.title}>
              {/* Thin divider line between sections (not before first) */}
              {sectionIndex > 0 && (
                <div className="mx-3 my-1.5 h-px bg-[var(--border-subtle)]" />
              )}
              {!collapsed && (
                <p className="px-2.5 mb-0.5 mt-1 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard/overview" &&
                    pathname.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link key={item.href} href={item.href}>
                    <motion.div
                      className={cn(
                        "relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-150",
                        isActive
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                        collapsed && "justify-center px-0"
                      )}
                      style={
                        isActive
                          ? {
                              background: "linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(168,85,247,0.06) 100%)",
                            }
                          : undefined
                      }
                      whileHover={
                        isActive
                          ? undefined
                          : {
                              x: collapsed ? 0 : 1,
                              backgroundColor: "var(--bg-hover)",
                            }
                      }
                      transition={{ duration: 0.12 }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r"
                          style={{
                            background: "linear-gradient(180deg, var(--accent-blue), var(--accent-purple))",
                          }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <Icon
                        className="flex-shrink-0"
                        style={{
                          width: 16,
                          height: 16,
                          color: isActive ? "var(--accent-blue)" : undefined,
                        }}
                      />
                      {!collapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
                          {item.badge}
                        </span>
                      )}
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer — fixed at bottom */}
        <div className="flex-shrink-0 border-t border-[var(--border-subtle)] px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            {!collapsed && (
              <>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--bg-hover)] to-[var(--bg-tertiary)] flex items-center justify-center text-[11px] font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border-subtle)]">
                  D
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate text-[var(--text-primary)]">Default Org</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] leading-tight">Team Plan</p>
                </div>
              </>
            )}
            <ThemeToggle collapsed={collapsed} />
          </div>
        </div>
      </aside>
    </>
  );
}
