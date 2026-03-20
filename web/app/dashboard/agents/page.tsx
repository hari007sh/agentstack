"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Plus,
  Clock,
  Activity,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Agent } from "@/lib/types";

// --- Mock Data ---
const mockAgents: (Agent & {
  session_count: number;
  last_active: string;
})[] = [
  {
    id: "agent_1",
    org_id: "org_1",
    name: "Research Agent",
    description:
      "Searches academic databases, retrieves papers, and synthesizes findings into structured research reports.",
    framework: "crewai",
    metadata: {},
    created_at: "2025-02-15T10:00:00Z",
    updated_at: "2025-03-20T09:45:00Z",
    session_count: 4821,
    last_active: "2 min ago",
  },
  {
    id: "agent_2",
    org_id: "org_1",
    name: "Code Review Agent",
    description:
      "Analyzes pull requests for code quality, security vulnerabilities, and best practice violations.",
    framework: "langgraph",
    metadata: {},
    created_at: "2025-02-20T10:00:00Z",
    updated_at: "2025-03-20T09:55:00Z",
    session_count: 3102,
    last_active: "5 min ago",
  },
  {
    id: "agent_3",
    org_id: "org_1",
    name: "Support Agent",
    description:
      "Handles customer support tickets by retrieving knowledge base articles and generating contextual responses.",
    framework: "langchain",
    metadata: {},
    created_at: "2025-03-01T10:00:00Z",
    updated_at: "2025-03-20T09:48:00Z",
    session_count: 2934,
    last_active: "12 min ago",
  },
  {
    id: "agent_4",
    org_id: "org_1",
    name: "Data Pipeline Agent",
    description:
      "Manages ETL workflows, processes batch data transformations, and generates SQL queries dynamically.",
    framework: "custom",
    metadata: {},
    created_at: "2025-03-05T10:00:00Z",
    updated_at: "2025-03-20T10:02:00Z",
    session_count: 1990,
    last_active: "just now",
  },
];

const frameworkColors: Record<string, string> = {
  crewai: "var(--accent-blue)",
  langgraph: "var(--accent-purple)",
  langchain: "var(--accent-green)",
  custom: "var(--text-tertiary)",
  openai: "var(--accent-amber)",
  anthropic: "var(--accent-red)",
};

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockAgents.length === 0;

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
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Registered agent definitions and their activity
          </p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:bg-[var(--accent-blue)]/90 transition-colors">
              <Plus className="w-4 h-4" />
              Register Agent
            </button>
          </DialogTrigger>
          <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
            <DialogHeader>
              <DialogTitle>Register New Agent</DialogTitle>
              <DialogDescription>
                Register a new agent definition to track its sessions and
                performance. Agent registration will be fully functional once
                the API is connected.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 text-center text-sm text-[var(--text-tertiary)]">
              Agent registration form coming soon.
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5"
            >
              <div className="flex items-start gap-3 mb-4">
                <SkeletonBlock className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <SkeletonBlock className="h-5 w-32 mb-2" />
                  <SkeletonBlock className="h-4 w-20" />
                </div>
              </div>
              <SkeletonBlock className="h-4 w-full mb-2" />
              <SkeletonBlock className="h-4 w-3/4 mb-4" />
              <div className="flex gap-4">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No agents registered</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Register your first agent to start tracking its sessions and
            performance metrics.
          </p>
        </div>
      )}

      {/* Agent Cards Grid */}
      {!loading && mockAgents.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {mockAgents.map((agent) => {
            const fwColor =
              frameworkColors[agent.framework] || frameworkColors.custom;

            return (
              <motion.div
                key={agent.id}
                variants={staggerItem}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--border-default)] transition-colors"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${fwColor} 12%, transparent)`,
                    }}
                  >
                    <Bot className="w-5 h-5" style={{ color: fwColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">
                      {agent.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-[10px] mt-1 border-[var(--border-subtle)]"
                      style={{ color: fwColor }}
                    >
                      {agent.framework}
                    </Badge>
                  </div>
                </div>

                <p className="text-xs text-[var(--text-secondary)] mb-4 line-clamp-2">
                  {agent.description}
                </p>

                <div className="flex items-center gap-4 text-[var(--text-tertiary)]">
                  <div className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3" />
                    <span className="text-xs">
                      {agent.session_count.toLocaleString()} sessions
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">{agent.last_active}</span>
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
