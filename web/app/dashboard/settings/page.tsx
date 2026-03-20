"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Building2,
  Globe,
  Trash2,
  AlertTriangle,
  Upload,
  Sun,
  Moon,
  Monitor,
  Clock,
  Database,
  Zap,
  Activity,
  Check,
} from "lucide-react";
import { useTheme } from "next-themes";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Mock data
const mockOrg = {
  name: "Acme Corp",
  slug: "acme-corp",
  plan: "Team" as const,
  environment: "production" as const,
  created_at: "2024-11-15",
  member_count: 7,
  events_used: 423847,
  events_limit: 1000000,
};

const planColors: Record<string, string> = {
  "Self-Hosted": "bg-zinc-500/10 text-zinc-400",
  Cloud: "bg-blue-500/10 text-blue-400",
  Team: "bg-purple-500/10 text-purple-400",
  Enterprise: "bg-amber-500/10 text-amber-400",
};

const planPrices: Record<string, string> = {
  "Self-Hosted": "Free",
  Cloud: "$49/mo",
  Team: "$199/mo",
  Enterprise: "Custom",
};

const timezones = [
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Asia/Kolkata", label: "Kolkata (IST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [orgName, setOrgName] = useState(mockOrg.name);
  const [orgSlug, setOrgSlug] = useState(mockOrg.slug);
  const [timezone, setTimezone] = useState("America/New_York");
  const [retention, setRetention] = useState("90");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setSaved(false);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  };

  const handleDeleteOrg = () => {
    if (deleteConfirmText !== mockOrg.slug) return;
    setDeleting(true);
    setTimeout(() => {
      setDeleting(false);
      setShowDeleteOrg(false);
      setDeleteConfirmText("");
    }, 1500);
  };

  const usagePercent = Math.round((mockOrg.events_used / mockOrg.events_limit) * 100);

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">General Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Manage your organization profile, preferences, and account
        </p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Organization Profile */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-[var(--accent-blue)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Organization Profile</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Basic details about your organization
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Logo upload placeholder */}
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium mb-2 block">
                Organization Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] flex items-center justify-center text-white text-2xl font-bold">
                  {orgName.charAt(0)}
                </div>
                <div>
                  <Button variant="outline" size="sm">
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    Upload Logo
                  </Button>
                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">
                    Recommended: 256x256px, PNG or SVG
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Organization Name
              </label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="bg-[var(--bg-primary)] border-[var(--border-default)]"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Slug
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-tertiary)] whitespace-nowrap">agentstack.dev/</span>
                <Input
                  value={orgSlug}
                  onChange={(e) =>
                    setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Plan & Usage */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-purple)]/10 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-[var(--accent-purple)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Plan & Usage</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Your current subscription and resource usage
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] mb-5">
            <div className="flex items-center gap-3">
              <Badge
                className={`${planColors[mockOrg.plan]} border-0 text-xs font-semibold`}
              >
                {mockOrg.plan}
              </Badge>
              <div>
                <p className="text-sm text-[var(--text-primary)] font-medium">
                  {mockOrg.plan} Plan
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {planPrices[mockOrg.plan]} &middot; {mockOrg.member_count} members &middot; Since{" "}
                  {new Date(mockOrg.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/settings/billing">Manage Plan</a>
            </Button>
          </div>

          {/* Usage bar */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[var(--text-tertiary)]" />
                <span className="text-sm text-[var(--text-primary)]">Events this month</span>
              </div>
              <span className="text-sm text-[var(--text-secondary)] tabular-nums">
                {(mockOrg.events_used / 1000).toFixed(0)}K{" "}
                <span className="text-[var(--text-tertiary)]">/ {(mockOrg.events_limit / 1000000).toFixed(0)}M</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden border border-[var(--border-subtle)]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                className={`h-full rounded-full ${
                  usagePercent > 95
                    ? "bg-[var(--accent-red)]"
                    : usagePercent > 80
                    ? "bg-[var(--accent-amber)]"
                    : "bg-[var(--accent-blue)]"
                }`}
              />
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)]">
              {usagePercent}% of monthly limit used
            </p>
          </div>
        </motion.div>

        {/* Theme Preference */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-amber)]/10 flex items-center justify-center">
              <Sun className="w-4.5 h-4.5 text-[var(--accent-amber)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Appearance</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Choose how AgentStack looks to you
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-md">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 ${
                    isSelected
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
                      : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--accent-blue)] flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  <Icon className={`w-5 h-5 ${isSelected ? "text-[var(--accent-blue)]" : "text-[var(--text-tertiary)]"}`} />
                  <span className={`text-xs font-medium ${isSelected ? "text-[var(--accent-blue)]" : "text-[var(--text-secondary)]"}`}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Preferences */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-green)]/10 flex items-center justify-center">
              <Globe className="w-4.5 h-4.5 text-[var(--accent-green)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Preferences</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Configure timezone and data retention
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Timezone
              </label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                All dates and times will be displayed in this timezone
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                Default Retention Period
              </label>
              <Select value={retention} onValueChange={setRetention}>
                <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">365 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                How long trace data is kept before automatic deletion
              </p>
            </div>
          </div>
        </motion.div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                Save Changes
              </span>
            )}
          </Button>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-sm text-[var(--accent-green)]"
            >
              Settings saved successfully
            </motion.span>
          )}
        </div>

        {/* Danger Zone */}
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/[0.02] p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-red)]/10 flex items-center justify-center">
              <AlertTriangle className="w-4.5 h-4.5 text-[var(--accent-red)]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--accent-red)]">Danger Zone</h2>
              <p className="text-xs text-[var(--text-tertiary)]">
                Irreversible and destructive actions
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-[var(--accent-red)]/10 bg-[var(--bg-primary)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Delete Organization</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                Permanently remove this organization and all its data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteOrg(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete
            </Button>
          </div>
        </motion.div>
      </motion.div>

      {/* Delete Organization Confirmation Dialog */}
      <Dialog open={showDeleteOrg} onOpenChange={(open) => { if (!open) { setShowDeleteOrg(false); setDeleteConfirmText(""); } }}>
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent-red)]">
              <AlertTriangle className="w-5 h-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All data including sessions, traces,
              API keys, team members, and billing information will be permanently deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--accent-red)]/5 border border-[var(--accent-red)]/10">
              <p className="text-xs text-[var(--text-secondary)]">
                To confirm, type <span className="font-mono font-semibold text-[var(--accent-red)]">{mockOrg.slug}</span> below:
              </p>
            </div>
            <Input
              placeholder={mockOrg.slug}
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="bg-[var(--bg-primary)] border-[var(--border-default)] font-mono"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteOrg(false); setDeleteConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrg}
              disabled={deleteConfirmText !== mockOrg.slug || deleting}
            >
              {deleting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Deleting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" />
                  Permanently Delete
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
