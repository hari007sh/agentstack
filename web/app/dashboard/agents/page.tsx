"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Plus,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
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
  DialogFooter,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";
import type { Agent } from "@/lib/types";

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
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFramework, setFormFramework] = useState("");

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      if (token) {
        api.setToken(token);
      }

      const data = await api.get<{ agents: Agent[] }>("/v1/agents");
      setAgents(data.agents ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Failed to load agents.");
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreate = async () => {
    if (!formName.trim()) {
      showError("Agent name is required.");
      return;
    }

    setCreating(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      if (token) {
        api.setToken(token);
      }

      const newAgent = await api.post<Agent>("/v1/agents", {
        name: formName.trim(),
        description: formDescription.trim(),
        framework: formFramework.trim() || "custom",
        metadata: {},
      });

      setAgents((prev) => [newAgent, ...prev]);
      setCreateOpen(false);
      setFormName("");
      setFormDescription("");
      setFormFramework("");
      showSuccess(`Agent "${newAgent.name}" created.`);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to create agent.");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("token")
          : null;
      if (token) {
        api.setToken(token);
      }

      await api.delete(`/v1/agents/${deleteTarget.id}`);

      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showSuccess(`Agent "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to delete agent.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const isEmpty = !loading && !error && agents.length === 0;

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

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
                performance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5 block">
                  Name *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Research Agent"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What does this agent do?"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors resize-none"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-1.5 block">
                  Framework
                </label>
                <select
                  value={formFramework}
                  onChange={(e) => setFormFramework(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-blue)] transition-colors"
                >
                  <option value="">Select framework</option>
                  <option value="crewai">CrewAI</option>
                  <option value="langgraph">LangGraph</option>
                  <option value="langchain">LangChain</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !formName.trim()}
                className="px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:bg-[var(--accent-blue)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Create Agent"}
              </button>
            </DialogFooter>
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

      {/* Error State */}
      {!loading && error && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-[var(--accent-red)]" />
            <h3 className="text-sm font-medium text-[var(--accent-red)]">
              Failed to load agents
            </h3>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error}</p>
          <button
            onClick={fetchAgents}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center mx-auto mb-4">
            <Bot className="w-6 h-6 text-[var(--accent-blue)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No agents registered</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Register your first agent to start tracking its sessions and
            performance metrics.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:bg-[var(--accent-blue)]/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Register Agent
          </button>
        </div>
      )}

      {/* Agent Cards Grid */}
      {!loading && !error && agents.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {agents.map((agent) => {
            const fwColor =
              frameworkColors[agent.framework] || frameworkColors.custom;

            return (
              <motion.div
                key={agent.id}
                variants={staggerItem}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 hover:border-[var(--border-default)] transition-colors group"
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
                      {agent.framework || "custom"}
                    </Badge>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(agent)}
                    className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent-red)] hover:bg-[var(--accent-red)]/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete agent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-[var(--text-secondary)] mb-4 line-clamp-2">
                  {agent.description || "No description provided."}
                </p>

                <div className="flex items-center gap-4 text-[var(--text-tertiary)]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span className="text-xs">
                      Updated{" "}
                      {new Date(agent.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {deleteTarget?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-medium hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-[var(--accent-red)] text-white text-sm font-medium hover:bg-[var(--accent-red)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
