"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Shield,
  Clock,
  Info,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type KeyType = "production" | "development";
type Permission = "read" | "write" | "admin";

interface APIKey {
  id: string;
  name: string;
  prefix: string;
  key_type: KeyType;
  permissions: Permission[];
  description: string;
  created_at: string;
  expires_at: string | null;
  last_used: string | null;
}

// Mock data
const mockKeys: APIKey[] = [
  {
    id: "1",
    name: "Production SDK",
    prefix: "as_sk_prod_7f3a...b2c1",
    key_type: "production",
    permissions: ["read", "write"],
    description: "Main production SDK key for trace ingestion",
    created_at: "2024-12-01T10:00:00Z",
    expires_at: null,
    last_used: "2026-03-20T08:30:00Z",
  },
  {
    id: "2",
    name: "Staging SDK",
    prefix: "as_sk_stg_4e2d...a9f0",
    key_type: "development",
    permissions: ["read", "write"],
    description: "Staging environment key",
    created_at: "2024-12-15T14:00:00Z",
    expires_at: "2026-06-15T00:00:00Z",
    last_used: "2026-03-19T22:15:00Z",
  },
  {
    id: "3",
    name: "CI/CD Pipeline",
    prefix: "as_sk_ci_8b1c...d4e7",
    key_type: "production",
    permissions: ["read"],
    description: "Read-only key for CI test quality gates",
    created_at: "2025-01-10T09:00:00Z",
    expires_at: "2026-04-10T00:00:00Z",
    last_used: null,
  },
  {
    id: "4",
    name: "Admin Dashboard",
    prefix: "as_sk_adm_2c9f...e8a3",
    key_type: "production",
    permissions: ["read", "write", "admin"],
    description: "Full admin access for internal tooling",
    created_at: "2025-02-20T11:00:00Z",
    expires_at: null,
    last_used: "2026-03-18T14:22:00Z",
  },
];

const keyTypeStyles: Record<KeyType, string> = {
  production: "bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20",
  development: "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20",
};

const permissionStyles: Record<Permission, string> = {
  read: "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]",
  write: "bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]",
  admin: "bg-[var(--accent-red)]/10 text-[var(--accent-red)]",
};

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>(mockKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState<string | null>(null);
  const [revokeConfirmText, setRevokeConfirmText] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Create form state
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyType, setNewKeyType] = useState<KeyType>("production");
  const [newKeyPerms, setNewKeyPerms] = useState<Set<Permission>>(new Set<Permission>(["read", "write"]));
  const [newKeyExpiration, setNewKeyExpiration] = useState("never");
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setTimeout(() => {
      const fakeKey = `as_sk_${newKeyType === "production" ? "prod" : "dev"}_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
      const expiresAt = newKeyExpiration === "never" ? null : (() => {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(newKeyExpiration));
        return d.toISOString();
      })();
      const newApiKey: APIKey = {
        id: String(Date.now()),
        name: newKeyName,
        prefix: `${fakeKey.slice(0, 16)}...${fakeKey.slice(-4)}`,
        key_type: newKeyType,
        permissions: Array.from(newKeyPerms),
        description: newKeyDescription,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        last_used: null,
      };
      setKeys((prev) => [newApiKey, ...prev]);
      setCreatedKey(fakeKey);
      setCreating(false);
    }, 600);
  };

  const handleRevoke = (id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
    setShowRevokeConfirm(null);
    setRevokeConfirmText("");
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePermission = (perm: Permission) => {
    setNewKeyPerms((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        if (perm === "read") return next; // read is always required
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  const resetCreateDialog = () => {
    setShowCreate(false);
    setNewKeyName("");
    setNewKeyType("production");
    setNewKeyPerms(new Set<Permission>(["read", "write"]));
    setNewKeyExpiration("never");
    setNewKeyDescription("");
    setCreatedKey(null);
    setCreating(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelative = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  };

  const getExpiryStatus = (expiresAt: string | null): { label: string; color: string } => {
    if (!expiresAt) return { label: "No expiry", color: "text-[var(--text-tertiary)]" };
    const now = Date.now();
    const expiry = new Date(expiresAt).getTime();
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: "Expired", color: "text-[var(--accent-red)]" };
    if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: "text-[var(--accent-red)]" };
    if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: "text-[var(--accent-amber)]" };
    return { label: formatDate(expiresAt), color: "text-[var(--text-secondary)]" };
  };

  const revokeKey = keys.find((k) => k.id === showRevokeConfirm);

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
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">API Keys</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage API keys for SDK and CLI authentication
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/10">
        <Info className="w-4 h-4 text-[var(--accent-blue)] mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-[var(--text-primary)]">
            API keys authenticate your SDK and CLI with AgentStack.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Keys are only shown once upon creation. Store them securely in your environment variables.
          </p>
        </div>
      </div>

      {/* Keys table */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
              <Key className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              No API keys yet
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4 text-center max-w-xs">
              Create your first API key to start sending data from your SDK or CLI.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Create API Key
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Key
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Type
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Permissions
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Expires
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Last Used
                  </th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const expiryStatus = getExpiryStatus(key.expires_at);
                  const isVisible = visibleKeys.has(key.id);
                  return (
                    <motion.tr
                      key={key.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-md bg-[var(--bg-hover)] flex items-center justify-center">
                            <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-[var(--text-primary)] block">
                              {key.name}
                            </span>
                            {key.description && (
                              <span className="text-[10px] text-[var(--text-tertiary)] block mt-0.5 max-w-[180px] truncate">
                                {key.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-xs text-[var(--text-secondary)] bg-[var(--bg-primary)] px-2 py-1 rounded">
                            {isVisible ? key.prefix.replace("...", "****") : key.prefix}
                          </code>
                          <button
                            onClick={() => toggleKeyVisibility(key.id)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            title={isVisible ? "Hide key" : "Show key"}
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleCopy(key.prefix, key.id)}
                            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            title="Copy key prefix"
                          >
                            {copiedId === key.id ? (
                              <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge className={`${keyTypeStyles[key.key_type]} border text-[10px] uppercase tracking-wider font-semibold`}>
                          {key.key_type}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1">
                          {key.permissions.map((perm) => (
                            <Badge key={perm} className={`${permissionStyles[perm]} border-0 text-[10px] uppercase tracking-wider font-medium`}>
                              {perm}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {expiryStatus.label === "Expired" || (key.expires_at && getExpiryStatus(key.expires_at).color.includes("red")) ? (
                            <Clock className="w-3 h-3 text-[var(--accent-red)]" />
                          ) : null}
                          <span className={`text-sm ${expiryStatus.color}`}>
                            {expiryStatus.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                        {formatRelative(key.last_used)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => setShowRevokeConfirm(key.id)}
                            className="p-1.5 rounded hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                            title="Revoke key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => !open && resetCreateDialog()}>
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {createdKey ? "API Key Created" : "Create API Key"}
            </DialogTitle>
            <DialogDescription>
              {createdKey
                ? "Copy your API key now. It will not be shown again."
                : "Configure your new API key with a name, permissions, and expiration."}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--accent-green)]/20">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-sm text-[var(--accent-green)] break-all">
                    {createdKey}
                  </code>
                  <button
                    onClick={() => handleCopy(createdKey, "new")}
                    className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
                  >
                    {copiedId === "new" ? (
                      <Check className="w-4 h-4 text-[var(--accent-green)]" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--accent-amber)]/5 border border-[var(--accent-amber)]/10">
                <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Store this key securely. You will not be able to view it again after closing this dialog.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={resetCreateDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Key Name
                </label>
                <Input
                  placeholder="e.g., Production SDK"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Description
                </label>
                <Textarea
                  placeholder="What will this key be used for?"
                  value={newKeyDescription}
                  onChange={(e) => setNewKeyDescription(e.target.value)}
                  className="bg-[var(--bg-primary)] border-[var(--border-default)] resize-none h-16"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Environment
                  </label>
                  <Select value={newKeyType} onValueChange={(v) => setNewKeyType(v as KeyType)}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Expiration
                  </label>
                  <Select value={newKeyExpiration} onValueChange={setNewKeyExpiration}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">No expiration</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium flex items-center gap-1.5">
                  <Shield className="w-3 h-3" />
                  Permissions
                </label>
                <div className="flex items-center gap-2">
                  {(["read", "write", "admin"] as Permission[]).map((perm) => {
                    const isSelected = newKeyPerms.has(perm);
                    const isRequired = perm === "read";
                    return (
                      <button
                        key={perm}
                        onClick={() => togglePermission(perm)}
                        disabled={isRequired}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          isSelected
                            ? `${permissionStyles[perm]} border-current`
                            : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:border-[var(--border-default)]"
                        } ${isRequired ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                        {perm.charAt(0).toUpperCase() + perm.slice(1)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  Read access is always enabled. Admin includes team management access.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetCreateDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newKeyName.trim() || creating}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    "Create Key"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm dialog with type-to-confirm */}
      <Dialog
        open={showRevokeConfirm !== null}
        onOpenChange={(open) => { if (!open) { setShowRevokeConfirm(null); setRevokeConfirmText(""); } }}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent-red)]">
              <AlertTriangle className="w-5 h-5" />
              Revoke API Key
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. Any applications using this key will
              lose access immediately.
            </DialogDescription>
          </DialogHeader>

          {revokeKey && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 mb-1">
                  <Key className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{revokeKey.name}</span>
                </div>
                <code className="font-mono text-xs text-[var(--text-tertiary)]">{revokeKey.prefix}</code>
              </div>
              <div>
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  To confirm, type <span className="font-mono font-semibold text-[var(--accent-red)]">{revokeKey.name}</span> below:
                </p>
                <Input
                  placeholder={revokeKey.name}
                  value={revokeConfirmText}
                  onChange={(e) => setRevokeConfirmText(e.target.value)}
                  className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRevokeConfirm(null); setRevokeConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showRevokeConfirm && handleRevoke(showRevokeConfirm)}
              disabled={!revokeKey || revokeConfirmText !== revokeKey.name}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
