"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Plus,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Trash2,
  Play,
  Send,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonTable } from "@/components/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";

// --- Types matching backend ---
interface WebhookEndpoint {
  id: string;
  org_id: string;
  name: string;
  type: string; // generic, slack, pagerduty
  url: string;
  secret?: string;
  events: string[];
  headers: Record<string, string> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  org_id: string;
  event: string;
  payload: unknown;
  status_code: number;
  response_body: string;
  attempts: number;
  status: string; // pending, delivered, failed
  next_retry_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

// Backend-valid event types (from handler/webhooks.go validEvents)
const eventTypes = [
  "alert.fired",
  "alert.resolved",
  "shield.healing",
  "shield.circuit_break",
  "guard.blocked",
  "guard.flagged",
  "cost.budget_warning",
  "cost.budget_exceeded",
  "test.run_completed",
  "test.run_failed",
  "session.failed",
];

const statusColors: Record<string, string> = {
  delivered: "var(--accent-green)",
  failed: "var(--accent-red)",
  pending: "var(--accent-amber)",
};

const statusIcons: Record<string, React.ElementType> = {
  delivered: CheckCircle2,
  failed: XCircle,
  pending: Clock,
};

const channelTypeLabels: Record<string, string> = {
  generic: "Generic",
  slack: "Slack",
  pagerduty: "PagerDuty",
};

function truncateUrl(url: string, maxLen = 45): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "...";
}

// formatTimeAgo available if needed for delivery timestamps
// function formatTimeAgo(ts: string | null): string { ... }

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function WebhooksPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);

  // Create dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newChannel, setNewChannel] = useState("generic");
  const [newSecret, setNewSecret] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Delete confirm dialog state
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test webhook state
  const [testingId, setTestingId] = useState<string | null>(null);

  // Toggle active state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delivery log state
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const initToken = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }
    return !!token;
  }, []);

  // --- Fetch webhooks ---
  const fetchWebhooks = useCallback(async () => {
    if (!initToken()) return;
    setError(null);
    try {
      const res = await api.get<{ data: WebhookEndpoint[] }>("/v1/webhooks");
      setWebhooks(res.data || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        showApiError(err);
      } else {
        setError("Failed to load webhooks");
        showError("Failed to load webhooks");
      }
    } finally {
      setLoading(false);
    }
  }, [initToken]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  // --- Fetch deliveries for a webhook ---
  const fetchDeliveries = useCallback(async (webhookId: string) => {
    if (!initToken()) return;
    setDeliveriesLoading(true);
    try {
      const res = await api.get<{ data: WebhookDelivery[] }>(
        `/v1/webhooks/${webhookId}/deliveries?limit=20`
      );
      setDeliveries(res.data || []);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to load deliveries");
      }
      setDeliveries([]);
    } finally {
      setDeliveriesLoading(false);
    }
  }, [initToken]);

  // Auto-load deliveries when a webhook is selected
  useEffect(() => {
    if (selectedWebhookId) {
      fetchDeliveries(selectedWebhookId);
    } else {
      setDeliveries([]);
    }
  }, [selectedWebhookId, fetchDeliveries]);

  // Auto-select first webhook for deliveries
  useEffect(() => {
    if (webhooks.length > 0 && !selectedWebhookId) {
      setSelectedWebhookId(webhooks[0].id);
    }
  }, [webhooks, selectedWebhookId]);

  // --- Create webhook ---
  const handleCreate = async () => {
    if (!newName.trim() || !newUrl.trim() || selectedEvents.length === 0) {
      showError("Name, URL, and at least one event are required");
      return;
    }
    if (!initToken()) return;

    setCreating(true);
    try {
      await api.post("/v1/webhooks", {
        name: newName.trim(),
        url: newUrl.trim(),
        type: newChannel,
        secret: newSecret.trim() || undefined,
        events: selectedEvents,
      });
      showSuccess("Webhook created successfully");
      resetCreateDialog();
      await fetchWebhooks();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to create webhook");
      }
    } finally {
      setCreating(false);
    }
  };

  // --- Delete webhook ---
  const handleDelete = async () => {
    if (!deleteTarget || !initToken()) return;

    setDeleting(true);
    try {
      await api.delete(`/v1/webhooks/${deleteTarget.id}`);
      showSuccess(`Webhook "${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      if (selectedWebhookId === deleteTarget.id) {
        setSelectedWebhookId(null);
      }
      await fetchWebhooks();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to delete webhook");
      }
    } finally {
      setDeleting(false);
    }
  };

  // --- Test webhook ---
  const handleTest = async (webhook: WebhookEndpoint) => {
    if (!initToken()) return;

    setTestingId(webhook.id);
    try {
      const res = await api.post<{ status?: string; data?: unknown; message?: string }>(
        `/v1/webhooks/${webhook.id}/test`
      );
      if (res.status === "failed") {
        showError(`Test delivery failed: ${res.message || "Unknown error"}`);
      } else {
        showSuccess("Test delivery sent successfully");
        // Refresh deliveries if this webhook is selected
        if (selectedWebhookId === webhook.id) {
          await fetchDeliveries(webhook.id);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to send test webhook");
      }
    } finally {
      setTestingId(null);
    }
  };

  // --- Toggle active/paused ---
  const handleToggleActive = async (webhook: WebhookEndpoint) => {
    if (!initToken()) return;

    setTogglingId(webhook.id);
    try {
      await api.patch(`/v1/webhooks/${webhook.id}`, {
        is_active: !webhook.is_active,
      });
      showSuccess(
        webhook.is_active
          ? `"${webhook.name}" paused`
          : `"${webhook.name}" activated`
      );
      await fetchWebhooks();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to update webhook");
      }
    } finally {
      setTogglingId(null);
    }
  };

  // --- Retry delivery ---
  const handleRetryDelivery = async (webhookId: string, deliveryId: string) => {
    if (!initToken()) return;

    try {
      await api.post(`/v1/webhooks/${webhookId}/deliveries/${deliveryId}/retry`);
      showSuccess("Delivery retry initiated");
      await fetchDeliveries(webhookId);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to retry delivery");
      }
    }
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const resetCreateDialog = () => {
    setCreateDialogOpen(false);
    setNewName("");
    setNewUrl("");
    setNewChannel("generic");
    setNewSecret("");
    setSelectedEvents([]);
  };

  const isEmpty = !loading && !error && webhooks.length === 0;

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
          <h1 className="text-xl font-semibold">Webhooks</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Configure webhook endpoints for real-time event notifications
          </p>
        </div>
        <button
          onClick={() => setCreateDialogOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <SkeletonTable rows={3} cols={5} />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/[0.02] p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--accent-red)]" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Failed to load webhooks
              </p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{error}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                fetchWebhooks();
              }}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 text-[var(--accent-amber)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No webhooks configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto mb-4">
            Add a webhook endpoint to receive real-time notifications about
            agent events.
          </p>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Webhook
          </Button>
        </div>
      )}

      {/* Webhooks Table */}
      {!loading && !error && webhooks.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Webhooks ({webhooks.length})
            </h3>
            <button
              onClick={() => {
                setLoading(true);
                fetchWebhooks();
              }}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Name", "URL", "Events", "Status", "Actions"].map(
                    (header) => (
                      <th
                        key={header}
                        className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium"
                      >
                        {header}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {webhooks.map((wh) => (
                  <motion.tr
                    key={wh.id}
                    variants={staggerItem}
                    className={`border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                      selectedWebhookId === wh.id
                        ? "bg-[var(--bg-hover)]"
                        : ""
                    }`}
                    onClick={() => setSelectedWebhookId(wh.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{wh.name}</p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                        >
                          {channelTypeLabels[wh.type] || wh.type}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-[var(--text-secondary)]">
                          {truncateUrl(wh.url)}
                        </span>
                        <ExternalLink className="w-3 h-3 text-[var(--text-tertiary)] flex-shrink-0" />
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-[var(--text-secondary)]">
                        {wh.events.length} event
                        {wh.events.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {wh.is_active ? (
                          <>
                            <div className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
                            <span className="text-xs text-[var(--accent-green)]">
                              Active
                            </span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3 h-3 text-[var(--text-tertiary)]" />
                            <span className="text-xs text-[var(--text-tertiary)]">
                              Paused
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleToggleActive(wh)}
                          disabled={togglingId === wh.id}
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                          title={wh.is_active ? "Pause" : "Activate"}
                        >
                          {wh.is_active ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleTest(wh)}
                          disabled={testingId === wh.id}
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors disabled:opacity-50"
                          title="Send test delivery"
                        >
                          {testingId === wh.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-[var(--text-tertiary)]/30 border-t-[var(--accent-blue)] rounded-full animate-spin block" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(wh)}
                          className="p-1.5 rounded hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                          title="Delete webhook"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Delivery Log */}
      {!loading && !error && webhooks.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-medium">Recent Deliveries</h3>
              {webhooks.length > 1 && (
                <Select
                  value={selectedWebhookId || ""}
                  onValueChange={setSelectedWebhookId}
                >
                  <SelectTrigger className="w-[200px] h-7 text-xs bg-transparent border-[var(--border-subtle)]">
                    <SelectValue placeholder="Select webhook" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                    {webhooks.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {selectedWebhookId && (
              <button
                onClick={() => fetchDeliveries(selectedWebhookId)}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                title="Refresh deliveries"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {deliveriesLoading ? (
            <div className="p-5">
              <SkeletonTable rows={3} cols={5} />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <Clock className="w-5 h-5 text-[var(--text-tertiary)] mb-2" />
              <p className="text-xs text-[var(--text-tertiary)]">
                No deliveries yet for this webhook
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    {[
                      "Time",
                      "Event",
                      "Status",
                      "Response Code",
                      "Attempts",
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
                  {deliveries.map((del) => {
                    const color =
                      statusColors[del.status] || "var(--text-tertiary)";
                    const StatusIcon =
                      statusIcons[del.status] || Clock;
                    return (
                      <motion.tr
                        key={del.id}
                        variants={staggerItem}
                        className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                          {formatTimestamp(del.delivered_at || del.created_at)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-mono text-[var(--text-secondary)]">
                            {del.event}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusIcon
                              className="w-3.5 h-3.5"
                              style={{ color }}
                            />
                            <span
                              className="text-xs capitalize font-medium"
                              style={{ color }}
                            >
                              {del.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs font-mono text-[var(--text-secondary)]">
                          {del.status_code > 0 ? del.status_code : "\u2014"}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                          {del.attempts}
                        </td>
                        <td className="px-5 py-3">
                          {del.status === "failed" && selectedWebhookId && (
                            <button
                              onClick={() =>
                                handleRetryDelivery(selectedWebhookId, del.id)
                              }
                              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--accent-blue)] transition-colors"
                              title="Retry delivery"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => !open && resetCreateDialog()}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              Configure a new webhook endpoint to receive event notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Name
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Webhook"
                className="bg-[var(--bg-primary)] border-[var(--border-default)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                URL
              </label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Channel Type
                </label>
                <Select value={newChannel} onValueChange={setNewChannel}>
                  <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)]">
                    <SelectItem value="generic">Generic</SelectItem>
                    <SelectItem value="slack">Slack</SelectItem>
                    <SelectItem value="pagerduty">PagerDuty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Secret{" "}
                  <span className="normal-case text-[var(--text-tertiary)]">
                    (optional)
                  </span>
                </label>
                <Input
                  value={newSecret}
                  onChange={(e) => setNewSecret(e.target.value)}
                  placeholder="whsec_..."
                  type="password"
                  className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Events
              </label>
              <div className="grid grid-cols-2 gap-2">
                {eventTypes.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] cursor-pointer hover:border-[var(--border-default)] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="rounded border-[var(--border-default)] bg-[var(--bg-primary)] text-[var(--accent-blue)] focus:ring-[var(--accent-blue)]"
                    />
                    <span className="text-xs font-mono text-[var(--text-secondary)]">
                      {event}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={resetCreateDialog}
              className="text-[var(--text-secondary)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !newName.trim() ||
                !newUrl.trim() ||
                selectedEvents.length === 0 ||
                creating
              }
              className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </span>
              ) : (
                "Add Webhook"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent-red)]">
              <AlertTriangle className="w-5 h-5" />
              Delete Webhook
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the webhook &quot;{deleteTarget?.name}&quot; and
              all its delivery history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Webhook
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
