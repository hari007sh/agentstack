"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  X,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";
import type { FailurePattern } from "@/lib/types";

// ---------------------------------------------------------------------------
// API response shapes (match Go handler exactly)
// ---------------------------------------------------------------------------

/** GET /v1/patterns response envelope */
interface PatternsListResponse {
  patterns: FailurePattern[];
}

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

const categoryColors: Record<string, string> = {
  loop: "var(--accent-blue)",
  hallucination: "var(--accent-purple)",
  timeout: "var(--accent-amber)",
  error: "var(--accent-red)",
  cost: "var(--accent-green)",
  custom: "var(--text-tertiary)",
};

const severityColors: Record<string, string> = {
  low: "var(--text-tertiary)",
  medium: "var(--accent-amber)",
  high: "var(--accent-red)",
  critical: "var(--accent-red)",
};

// ---------------------------------------------------------------------------
// Create-pattern form state
// ---------------------------------------------------------------------------
interface CreatePatternForm {
  name: string;
  description: string;
  category: string;
  severity: string;
}

const emptyForm: CreatePatternForm = {
  name: "",
  description: "",
  category: "custom",
  severity: "medium",
};

const validCategories = ["loop", "hallucination", "timeout", "error", "cost", "custom"];
const validSeverities = ["low", "medium", "high", "critical"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PatternsPage() {
  const [patterns, setPatterns] = useState<FailurePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreatePatternForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<FailurePattern | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Fetch patterns ----
  const fetchPatterns = useCallback(async () => {
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

      const res = await api.get<PatternsListResponse>("/v1/patterns");
      setPatterns(res.patterns ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
        setError(err.message);
      } else {
        showError("Failed to load failure patterns");
        setError("Failed to load failure patterns");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  // ---- Create pattern ----
  const handleCreate = async () => {
    if (!form.name.trim()) {
      showError("Name is required");
      return;
    }
    if (!form.category) {
      showError("Category is required");
      return;
    }

    setCreating(true);
    try {
      const created = await api.post<FailurePattern>("/v1/patterns", {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        severity: form.severity,
        is_builtin: false,
        enabled: true,
      });
      setPatterns((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setForm(emptyForm);
      showSuccess("Pattern created successfully");
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to create pattern");
      }
    } finally {
      setCreating(false);
    }
  };

  // ---- Delete pattern ----
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/patterns/${deleteTarget.id}`);
      setPatterns((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      showSuccess(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to delete pattern");
      }
    } finally {
      setDeleting(false);
    }
  };

  const isEmpty = !loading && !error && patterns.length === 0;

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
          <h1 className="text-xl font-semibold">Failure Patterns</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Detection rules for common agent failure modes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPatterns}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Pattern
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={8} cols={6} />}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-[var(--accent-red)] mx-auto mb-2" />
          <p className="text-sm text-[var(--accent-red)] mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchPatterns}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-purple)]/10 flex items-center justify-center mx-auto mb-4">
            <Fingerprint className="w-6 h-6 text-[var(--accent-purple)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No patterns configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Failure patterns help detect common agent issues automatically. Create
            your first pattern or seed built-in patterns.
          </p>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Pattern
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && patterns.length > 0 && (
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
                    "Category",
                    "Severity",
                    "Enabled",
                    "Type",
                    "",
                  ].map((header) => (
                    <th
                      key={header || "actions"}
                      className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patterns.map((pattern) => {
                  const catColor =
                    categoryColors[pattern.category] || "var(--text-tertiary)";
                  const sevColor =
                    severityColors[pattern.severity] || "var(--text-tertiary)";

                  return (
                    <motion.tr
                      key={pattern.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div>
                          <p className="text-sm font-medium">{pattern.name}</p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 max-w-md truncate">
                            {pattern.description}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${catColor} 12%, transparent)`,
                            color: catColor,
                          }}
                        >
                          {pattern.category}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${sevColor} 12%, transparent)`,
                            color: sevColor,
                          }}
                        >
                          {pattern.severity}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div
                          className={`w-8 h-5 rounded-full relative transition-colors ${
                            pattern.enabled
                              ? "bg-[var(--accent-green)]"
                              : "bg-[var(--bg-hover)]"
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              pattern.enabled
                                ? "translate-x-3.5"
                                : "translate-x-0.5"
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {pattern.is_builtin ? "Built-in" : "Custom"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {!pattern.is_builtin && (
                          <button
                            onClick={() => setDeleteTarget(pattern)}
                            className="p-1.5 rounded-md hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                            title="Delete pattern"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ---- Create Modal ---- */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-semibold">New Failure Pattern</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                    placeholder="e.g. Infinite Tool Loop"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    rows={3}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] resize-none"
                    placeholder="Describe when this pattern is triggered..."
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Category *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value }))
                    }
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                  >
                    {validCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Severity */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Severity
                  </label>
                  <select
                    value={form.severity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, severity: e.target.value }))
                    }
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                  >
                    {validSeverities.map((sev) => (
                      <option key={sev} value={sev}>
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? "Creating..." : "Create Pattern"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Delete Confirmation Modal ---- */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-base font-semibold mb-2">Delete Pattern</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">
                Are you sure you want to delete{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {deleteTarget.name}
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-[var(--accent-red)] hover:bg-[var(--accent-red)]/90 text-white"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
