"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Plus,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- Mock Data ---
interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  channel_type: "generic" | "slack" | "pagerduty";
  status: "active" | "paused";
  last_delivery_at: string | null;
  created_at: string;
}

interface DeliveryLog {
  id: string;
  webhook_id: string;
  event: string;
  status: "success" | "failed" | "pending";
  response_code: number | null;
  latency_ms: number;
  delivered_at: string;
}

const mockWebhooks: Webhook[] = [
  {
    id: "wh_001",
    name: "Production Alerts",
    url: "https://hooks.slack.com/services/T00/B00/xxxx",
    events: ["session.failed", "alert.triggered", "budget.exceeded"],
    channel_type: "slack",
    status: "active",
    last_delivery_at: "2026-03-20T09:15:00Z",
    created_at: "2026-01-10T08:00:00Z",
  },
  {
    id: "wh_002",
    name: "Incident Webhook",
    url: "https://events.pagerduty.com/integration/xxxx/enqueue",
    events: ["session.failed", "healing.failed"],
    channel_type: "pagerduty",
    status: "active",
    last_delivery_at: "2026-03-19T22:30:00Z",
    created_at: "2026-02-15T10:00:00Z",
  },
  {
    id: "wh_003",
    name: "Analytics Pipeline",
    url: "https://api.internal.acme.com/webhooks/agentstack",
    events: ["session.completed", "test.run.completed"],
    channel_type: "generic",
    status: "paused",
    last_delivery_at: "2026-03-15T14:00:00Z",
    created_at: "2026-03-01T12:00:00Z",
  },
];

const mockDeliveries: DeliveryLog[] = [
  {
    id: "del_001",
    webhook_id: "wh_001",
    event: "alert.triggered",
    status: "success",
    response_code: 200,
    latency_ms: 142,
    delivered_at: "2026-03-20T09:15:00Z",
  },
  {
    id: "del_002",
    webhook_id: "wh_001",
    event: "session.failed",
    status: "success",
    response_code: 200,
    latency_ms: 98,
    delivered_at: "2026-03-20T08:45:00Z",
  },
  {
    id: "del_003",
    webhook_id: "wh_002",
    event: "healing.failed",
    status: "failed",
    response_code: 503,
    latency_ms: 5230,
    delivered_at: "2026-03-19T22:30:00Z",
  },
  {
    id: "del_004",
    webhook_id: "wh_001",
    event: "budget.exceeded",
    status: "success",
    response_code: 200,
    latency_ms: 112,
    delivered_at: "2026-03-19T16:00:00Z",
  },
  {
    id: "del_005",
    webhook_id: "wh_003",
    event: "session.completed",
    status: "pending",
    response_code: null,
    latency_ms: 0,
    delivered_at: "2026-03-15T14:00:00Z",
  },
];

const eventTypes = [
  "session.completed",
  "session.failed",
  "alert.triggered",
  "budget.exceeded",
  "healing.failed",
  "test.run.completed",
  "guard.blocked",
];

const statusColors: Record<string, string> = {
  success: "var(--accent-green)",
  failed: "var(--accent-red)",
  pending: "var(--accent-amber)",
};

const statusIcons: Record<string, React.ElementType> = {
  success: CheckCircle2,
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

function formatTimeAgo(ts: string | null): string {
  if (!ts) return "Never";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / (1000 * 60));
  if (diffM < 1) return "Just now";
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newChannel, setNewChannel] = useState("generic");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const isEmpty = !loading && mockWebhooks.length === 0;

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  const handleCreate = () => {
    setDialogOpen(false);
    setNewName("");
    setNewUrl("");
    setNewChannel("generic");
    setSelectedEvents([]);
  };

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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent-blue)] text-white text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98]">
              <Plus className="w-4 h-4" />
              Add Webhook
            </button>
          </DialogTrigger>
          <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)] max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Webhook</DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                Configure a new webhook endpoint.
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
                onClick={() => setDialogOpen(false)}
                className="text-[var(--text-secondary)]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue)]/90"
              >
                Add Webhook
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-6">
          <SkeletonTable rows={3} cols={5} />
          <SkeletonTable rows={5} cols={5} />
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent-amber)]/10 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 text-[var(--accent-amber)]" />
          </div>
          <h3 className="text-sm font-medium mb-1">No webhooks configured</h3>
          <p className="text-xs text-[var(--text-tertiary)] max-w-sm mx-auto">
            Add a webhook endpoint to receive real-time notifications about
            agent events.
          </p>
        </div>
      )}

      {/* Webhooks Table */}
      {!loading && mockWebhooks.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Webhooks</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Name", "URL", "Events", "Status", "Last Delivery"].map(
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
                {mockWebhooks.map((wh) => (
                  <motion.tr
                    key={wh.id}
                    variants={staggerItem}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{wh.name}</p>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-5 border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                        >
                          {channelTypeLabels[wh.channel_type]}
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
                        {wh.events.length} event{wh.events.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {wh.status === "active" ? (
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
                    <td className="px-5 py-3 text-xs text-[var(--text-tertiary)]">
                      {formatTimeAgo(wh.last_delivery_at)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Delivery Log */}
      {!loading && mockDeliveries.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium">Recent Deliveries</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {["Time", "Event", "Status", "Response Code", "Latency"].map(
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
                {mockDeliveries.map((del) => {
                  const color = statusColors[del.status];
                  const StatusIcon = statusIcons[del.status];
                  return (
                    <motion.tr
                      key={del.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                        {formatTimestamp(del.delivered_at)}
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
                        {del.response_code ?? "\u2014"}
                      </td>
                      <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                        {del.latency_ms > 0 ? `${del.latency_ms}ms` : "\u2014"}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
