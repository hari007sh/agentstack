"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Plus,
  Mail,
  Trash2,
  Crown,
  ShieldCheck,
  User,
  Eye,
  Clock,
  Check,
  AlertTriangle,
  X,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

type Role = "owner" | "admin" | "member" | "viewer";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  joined_at: string;
  avatar_initials: string;
  status: "active" | "pending";
  last_active?: string;
}

// Mock data
const mockMembers: TeamMember[] = [
  {
    id: "1",
    name: "Harish Talluri",
    email: "harish@acme.com",
    role: "owner",
    joined_at: "2024-11-15T10:00:00Z",
    avatar_initials: "HT",
    status: "active",
    last_active: "2026-03-20T09:00:00Z",
  },
  {
    id: "2",
    name: "Sarah Chen",
    email: "sarah@acme.com",
    role: "admin",
    joined_at: "2024-12-01T14:00:00Z",
    avatar_initials: "SC",
    status: "active",
    last_active: "2026-03-20T07:30:00Z",
  },
  {
    id: "3",
    name: "Alex Rivera",
    email: "alex@acme.com",
    role: "member",
    joined_at: "2025-01-10T09:00:00Z",
    avatar_initials: "AR",
    status: "active",
    last_active: "2026-03-19T18:22:00Z",
  },
  {
    id: "4",
    name: "Jordan Park",
    email: "jordan@acme.com",
    role: "viewer",
    joined_at: "2025-02-05T16:00:00Z",
    avatar_initials: "JP",
    status: "active",
    last_active: "2026-03-18T12:00:00Z",
  },
  {
    id: "5",
    name: "Priya Gupta",
    email: "priya@acme.com",
    role: "admin",
    joined_at: "2025-02-20T11:00:00Z",
    avatar_initials: "PG",
    status: "active",
    last_active: "2026-03-20T08:45:00Z",
  },
  {
    id: "6",
    name: "New Hire",
    email: "newhire@acme.com",
    role: "member",
    joined_at: "2026-03-18T11:00:00Z",
    avatar_initials: "NH",
    status: "pending",
  },
  {
    id: "7",
    name: "Contractor",
    email: "contractor@external.com",
    role: "viewer",
    joined_at: "2026-03-15T09:00:00Z",
    avatar_initials: "CO",
    status: "pending",
  },
];

const roleBadgeStyles: Record<Role, string> = {
  owner: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  member: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  viewer: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const roleIcons: Record<Role, React.ElementType> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
  viewer: Eye,
};

const roleDescriptions: Record<Role, string> = {
  owner: "Full control, billing, can delete org",
  admin: "Full access, manage team and settings",
  member: "View and use all features",
  viewer: "Read-only access to dashboards",
};

const avatarColors = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-amber-500 to-orange-500",
  "from-green-500 to-emerald-500",
  "from-red-500 to-rose-500",
  "from-indigo-500 to-violet-500",
  "from-teal-500 to-cyan-500",
];

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(mockMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteMessage, setInviteMessage] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [batchEmails, setBatchEmails] = useState("");
  const [inviteExpiration, setInviteExpiration] = useState("7");
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");

  const handleInvite = () => {
    const emails = batchMode
      ? batchEmails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean)
      : [inviteEmail.trim()];
    if (emails.length === 0 || emails.some((e) => !e)) return;

    setInviting(true);
    setTimeout(() => {
      const newMembers: TeamMember[] = emails.map((email) => {
        const initials = email
          .split("@")[0]
          .split(/[._-]/)
          .map((p) => p[0]?.toUpperCase() || "")
          .slice(0, 2)
          .join("");
        return {
          id: String(Date.now() + Math.random()),
          name: email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          email,
          role: inviteRole,
          joined_at: new Date().toISOString(),
          avatar_initials: initials || "??",
          status: "pending" as const,
        };
      });
      setMembers((prev) => [...prev, ...newMembers]);
      setInviting(false);
      setInvited(true);
      setTimeout(() => {
        resetInviteDialog();
      }, 1500);
    }, 800);
  };

  const handleRemove = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setShowRemoveConfirm(null);
  };

  const handleRoleChange = (memberId: string, newRole: Role) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  };

  const resetInviteDialog = () => {
    setShowInvite(false);
    setInviteEmail("");
    setInviteRole("member");
    setInviteMessage("");
    setBatchMode(false);
    setBatchEmails("");
    setInviteExpiration("7");
    setInviting(false);
    setInvited(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatRelative = (dateStr?: string) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  };

  const removeMember = members.find((m) => m.id === showRemoveConfirm);

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
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Team</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage team members, roles, and invitations
          </p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite Members
        </Button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(
          [
            { label: "Total Members", value: members.length, color: "var(--accent-blue)" },
            { label: "Active", value: activeMembers.length, color: "var(--accent-green)" },
            { label: "Pending", value: pendingMembers.length, color: "var(--accent-amber)" },
            { label: "Admins", value: members.filter((m) => m.role === "admin" || m.role === "owner").length, color: "var(--accent-purple)" },
          ] as const
        ).map((stat) => (
          <motion.div
            key={stat.label}
            variants={staggerItem}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
          >
            <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
              {stat.label}
            </p>
            <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: stat.color }}>
              {stat.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Pending Invitations */}
      {pendingMembers.length > 0 && (
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/[0.02] p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[var(--accent-amber)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Pending Invitations ({pendingMembers.length})
            </h3>
          </div>
          <div className="space-y-2">
            {pendingMembers.map((member) => {
              const RoleIcon = roleIcons[member.role];
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColors[parseInt(member.id) % avatarColors.length]} flex items-center justify-center text-xs font-medium text-white opacity-60`}>
                      {member.avatar_initials}
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">{member.email}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)]">
                        Invited {formatRelative(member.joined_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${roleBadgeStyles[member.role]} border text-[10px] uppercase tracking-wider font-semibold gap-1`}>
                      <RoleIcon className="w-3 h-3" />
                      {member.role}
                    </Badge>
                    <button
                      onClick={() => setShowRemoveConfirm(member.id)}
                      className="p-1.5 rounded hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                      title="Revoke invitation"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Active Members table */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Active Members</h3>
        </div>
        {activeMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
              <Users className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              No team members
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Invite your team to collaborate on AgentStack.
            </p>
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Invite Members
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Member
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Role
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Joined
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Last Active
                  </th>
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member, index) => {
                  const RoleIcon = roleIcons[member.role];
                  return (
                    <motion.tr
                      key={member.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColors[index % avatarColors.length]} flex items-center justify-center text-xs font-medium text-white`}>
                            {member.avatar_initials}
                          </div>
                          <div>
                            <span className="text-sm font-medium text-[var(--text-primary)] block">
                              {member.name}
                            </span>
                            <span className="text-[11px] text-[var(--text-tertiary)] block">
                              {member.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        {member.role === "owner" ? (
                          <Badge className={`${roleBadgeStyles[member.role]} border text-[10px] uppercase tracking-wider font-semibold gap-1`}>
                            <RoleIcon className="w-3 h-3" />
                            {member.role}
                          </Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member.id, v as Role)}
                          >
                            <SelectTrigger className="w-[130px] h-7 text-xs bg-transparent border-[var(--border-subtle)]">
                              <div className="flex items-center gap-1.5">
                                <RoleIcon className="w-3 h-3" />
                                <span className="capitalize">{member.role}</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                                  <div>
                                    <span className="block text-sm">Admin</span>
                                    <span className="block text-[10px] text-[var(--text-tertiary)]">{roleDescriptions.admin}</span>
                                  </div>
                                </div>
                              </SelectItem>
                              <SelectItem value="member">
                                <div className="flex items-center gap-2">
                                  <User className="w-3.5 h-3.5 text-zinc-400" />
                                  <div>
                                    <span className="block text-sm">Member</span>
                                    <span className="block text-[10px] text-[var(--text-tertiary)]">{roleDescriptions.member}</span>
                                  </div>
                                </div>
                              </SelectItem>
                              <SelectItem value="viewer">
                                <div className="flex items-center gap-2">
                                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  <div>
                                    <span className="block text-sm">Viewer</span>
                                    <span className="block text-[10px] text-[var(--text-tertiary)]">{roleDescriptions.viewer}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                        {formatDate(member.joined_at)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                        {formatRelative(member.last_active)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end">
                          {member.role !== "owner" && (
                            <button
                              onClick={() => setShowRemoveConfirm(member.id)}
                              className="p-1.5 rounded hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={(open) => !open && resetInviteDialog()}>
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)] max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {invited ? "Invitations Sent" : "Invite Team Members"}
            </DialogTitle>
            <DialogDescription>
              {invited
                ? "Invitation emails have been sent successfully."
                : "Send invitations to join your organization."}
            </DialogDescription>
          </DialogHeader>

          {invited ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--accent-green)]/5 border border-[var(--accent-green)]/10">
                <Check className="w-5 h-5 text-[var(--accent-green)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Invitations sent successfully
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Recipients will receive an email with a link to join.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toggle single/batch */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBatchMode(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    !batchMode
                      ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Single Invite
                </button>
                <button
                  onClick={() => setBatchMode(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    batchMode
                      ? "bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Batch Invite
                </button>
              </div>

              {batchMode ? (
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Email Addresses
                  </label>
                  <Textarea
                    placeholder={"Enter email addresses, one per line:\njohn@company.com\njane@company.com\nalex@company.com"}
                    value={batchEmails}
                    onChange={(e) => setBatchEmails(e.target.value)}
                    className="bg-[var(--bg-primary)] border-[var(--border-default)] resize-none h-24 font-mono text-xs"
                  />
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    Separate with newlines, commas, or semicolons
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="bg-[var(--bg-primary)] border-[var(--border-default)]"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Role
                  </label>
                  <Select value={inviteRole} onValueChange={(v: string) => setInviteRole(v as Role)}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                          Admin
                        </div>
                      </SelectItem>
                      <SelectItem value="member">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          Member
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="w-3.5 h-3.5 text-emerald-400" />
                          Viewer
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Expires In
                  </label>
                  <Select value={inviteExpiration} onValueChange={setInviteExpiration}>
                    <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">24 hours</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                  Custom Message <span className="normal-case text-[var(--text-tertiary)]">(optional)</span>
                </label>
                <Textarea
                  placeholder="Add a personal message to the invitation email..."
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  className="bg-[var(--bg-primary)] border-[var(--border-default)] resize-none h-16"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetInviteDialog}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={
                    (batchMode ? !batchEmails.trim() : !inviteEmail.trim()) || inviting
                  }
                >
                  {inviting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      {batchMode ? "Send Invitations" : "Send Invite"}
                    </span>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove confirm dialog */}
      <Dialog
        open={showRemoveConfirm !== null}
        onOpenChange={(open) => !open && setShowRemoveConfirm(null)}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent-red)]">
              <AlertTriangle className="w-5 h-5" />
              {removeMember?.status === "pending" ? "Revoke Invitation" : "Remove Team Member"}
            </DialogTitle>
            <DialogDescription>
              {removeMember?.status === "pending"
                ? "This will cancel the pending invitation."
                : "This person will immediately lose access to your organization."}
            </DialogDescription>
          </DialogHeader>

          {removeMember && removeMember.status === "active" && (
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                {removeMember.name} will lose access to:
              </p>
              <ul className="space-y-1">
                {["All dashboards and analytics", "API keys and SDK access", "Team collaboration features", "Test suites and guardrail configs"].map((item) => (
                  <li key={item} className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <X className="w-3 h-3 text-[var(--accent-red)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                showRemoveConfirm && handleRemove(showRemoveConfirm)
              }
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {removeMember?.status === "pending" ? "Revoke Invitation" : "Remove Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
