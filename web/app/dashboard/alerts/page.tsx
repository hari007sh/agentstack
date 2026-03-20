"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Mail,
  MessageSquare,
  Webhook,
  Plus,
  Trash2,
  RefreshCw,
  X,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";
import type { AlertRule } from "@/lib/types";

// ---------------------------------------------------------------------------
// API response shapes (match Go handler exactly)
// ---------------------------------------------------------------------------

/** GET /v1/alerts response envelope */
interface AlertsListResponse {
  alert_rules: AlertRule[];
}

// ---------------------------------------------------------------------------
// Colour maps & icons
// ---------------------------------------------------------------------------

const conditionTypeColors: Record<string, string> = {
  failure_rate: "var(--accent-red)",
  cost_threshold: "var(--accent-amber)",
  healing_rate: "var(--healing-blue)",
  latency: "var(--accent-purple)",
  pattern_match: "var(--accent-blue)",
  threshold: "var(--accent-amber)",
  pattern: "var(--accent-blue)",
  anomaly: "var(--accent-purple)",
};

const channelIcons: Record<string, React.ElementType> = {
  email: Mail,
  slack: MessageSquare,
  webhook: Webhook,
};

// ---------------------------------------------------------------------------
// Create-alert form state
// ---------------------------------------------------------------------------
interface CreateAlertForm {
  name: string;
  description: string;
  condition_type: string;
  channels: string[];
}

const emptyForm: CreateAlertForm = {
  name: "",
  description: "",
  condition_type: "threshold",
  channels: [],
};

const validConditionTypes = ["threshold", "pattern", "anomaly"];
const availableChannels = ["email", "slack", "webhook"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLastTriggered(ts: string | null | undefined): string {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<CreateAlertForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Fetch alerts ----
  const fetchAlerts = useCallback(async () => {
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

      const res = await api.get<AlertsListResponse>("/v1/alerts");
      setAlerts(res.alert_rules ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
        setError(err.message);
      } else {
        showError("Failed to load alert rules");
        setError("Failed to load alert rules");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // ---- Create alert ----
  const handleCreate = async () => {
    if (!form.name.trim()) {
      showError("Name is required");
      return;
    }
    if (!form.condition_type) {
      showError("Condition type is required");
      return;
    }

    setCreating(true);
    try {
      const created = await api.post<AlertRule>("/v1/alerts", {
        name: form.name.trim(),
        description: form.description.trim(),
        condition_type: form.condition_type,
        channels: form.channels,
        enabled: true,
      });
      setAlerts((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setForm(emptyForm);
      showSuccess("Alert rule created successfully");
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to create alert rule");
      }
    } finally {
      setCreating(false);
    }
  };

  // ---- Delete alert ----
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/v1/alerts/${deleteTarget.id}`);
      setAlerts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      showSuccess(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to delete alert rule");
      }
    } finally {
      setDeleting(false);
    }
  };

  // ---- Toggle channel in create form ----
  const toggleChannel = (ch: string) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  };

  const isEmpty = !loading && !error && alerts.length === 0;

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
          <h1 className="text-xl font-semibold">Alert Rules</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure alerts for anomalous agent behavior and operational issues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAlerts}
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Alert
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && <SkeletonTable rows={5} cols={5} />}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-[var(--accent-red)] mx-auto mb-2" />
          <p className="text-sm text-[var(--accent-red)] mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchAlerts}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--accent-amber)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No alert rules configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Create alert rules to get notified when your agents encounter
            issues.
          </p>
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Alert
          </Button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && alerts.length > 0 && (
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
                {alerts.map((alert) => {
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
                          {alert.condition_type.replace(/_/g, " ")}
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
                          {(alert.channels ?? []).map((channel) => {
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
                          {(!alert.channels || alert.channels.length === 0) && (
                            <span className="text-xs text-[var(--text-tertiary)]">
                              None
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setDeleteTarget(alert)}
                          className="p-1.5 rounded-md hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                          title="Delete alert"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                <h2 className="text-base font-semibold">New Alert Rule</h2>
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
                    placeholder="e.g. High Failure Rate"
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
                    placeholder="When should this alert fire?"
                  />
                </div>

                {/* Condition Type */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Condition Type *
                  </label>
                  <select
                    value={form.condition_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        condition_type: e.target.value,
                      }))
                    }
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)]"
                  >
                    {validConditionTypes.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct.charAt(0).toUpperCase() + ct.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Channels */}
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">
                    Notification Channels
                  </label>
                  <div className="flex items-center gap-2">
                    {availableChannels.map((ch) => {
                      const Icon = channelIcons[ch] || Bell;
                      const selected = form.channels.includes(ch);
                      return (
                        <button
                          key={ch}
                          onClick={() => toggleChannel(ch)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selected
                              ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                              : "border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--text-tertiary)] hover:border-[var(--border-default)] hover:text-[var(--text-secondary)]"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {ch.charAt(0).toUpperCase() + ch.slice(1)}
                        </button>
                      );
                    })}
                  </div>
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
                  {creating ? "Creating..." : "Create Alert"}
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
              <h2 className="text-base font-semibold mb-2">Delete Alert Rule</h2>
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
