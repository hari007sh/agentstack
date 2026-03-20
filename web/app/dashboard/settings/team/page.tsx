"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Crown,
  ShieldCheck,
  User,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  UserPlus,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { api, ApiError } from "@/lib/api";
import { showSuccess, showError, showApiError } from "@/lib/toast";

type Role = "owner" | "admin" | "member";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

const roleBadgeStyles: Record<Role, string> = {
  owner: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  member: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const roleIcons: Record<Role, React.ElementType> = {
  owner: Crown,
  admin: ShieldCheck,
  member: User,
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

function getInitials(name: string, email: string): string {
  if (name) {
    return name
      .split(/\s+/)
      .map((p) => p[0]?.toUpperCase() || "")
      .slice(0, 2)
      .join("");
  }
  return email
    .split("@")[0]
    .split(/[._-]/)
    .map((p) => p[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Invite dialog state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviting, setInviting] = useState(false);

  // Remove dialog state
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  // Role change loading state
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const initToken = useCallback(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }
    return !!token;
  }, []);

  // Parse current user from JWT
  useEffect(() => {
    try {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setCurrentUser({
          id: payload.sub || payload.user_id || "",
          email: payload.email || "",
          name: payload.name || "",
          role: (payload.role as Role) || "member",
        });
      }
    } catch {
      // JWT parsing failed
    }
  }, []);

  // Fetch team members
  const fetchTeam = useCallback(async () => {
    if (!initToken()) {
      setLoading(false);
      return;
    }

    try {
      const data = await api.get<TeamMember[]>("/api/team");
      setMembers(data);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to load team members");
      }
    } finally {
      setLoading(false);
    }
  }, [initToken]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Invite member
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);

    try {
      initToken();
      const newMember = await api.post<TeamMember>("/api/team/invite", {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
      });
      setMembers((prev) => [...prev, newMember]);
      showSuccess(`${inviteName.trim()} has been added to the team`);
      resetInviteDialog();
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to invite team member");
      }
    } finally {
      setInviting(false);
    }
  };

  // Remove member
  const handleRemove = async (member: TeamMember) => {
    setRemoving(true);
    try {
      initToken();
      await api.delete(`/api/team/${member.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      showSuccess(`${member.name || member.email} has been removed`);
      setRemoveTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to remove team member");
      }
    } finally {
      setRemoving(false);
    }
  };

  // Update role
  const handleRoleChange = async (memberId: string, newRole: Role) => {
    setUpdatingRoleId(memberId);
    try {
      initToken();
      const updated = await api.patch<TeamMember>(
        `/api/team/${memberId}/role`,
        { role: newRole }
      );
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? updated : m))
      );
      showSuccess("Role updated successfully");
    } catch (err) {
      if (err instanceof ApiError) {
        showApiError(err);
      } else {
        showError("Failed to update role");
      }
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const resetInviteDialog = () => {
    setShowInvite(false);
    setInviteEmail("");
    setInviteName("");
    setInviteRole("member");
    setInviting(false);
  };

  const isCurrentUser = (memberId: string) => currentUser?.id === memberId;

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-24 bg-[var(--bg-hover)] rounded animate-pulse" />
            <div className="h-4 w-64 bg-[var(--bg-hover)] rounded animate-pulse mt-2" />
          </div>
          <div className="h-9 w-36 bg-[var(--bg-hover)] rounded animate-pulse" />
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 py-3">
              <div className="h-8 w-8 bg-[var(--bg-hover)] rounded-full animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-[var(--bg-hover)] rounded animate-pulse" />
                <div className="h-3 w-24 bg-[var(--bg-hover)] rounded animate-pulse" />
              </div>
              <div className="h-5 w-20 bg-[var(--bg-hover)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

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
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Team
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage team members, roles, and access
          </p>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {/* Members count */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Users className="w-4 h-4" />
        <span>
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
      </div>

      {/* Members table */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
      >
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--bg-hover)] flex items-center justify-center mb-4">
              <Users className="w-5 h-5 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
              No team members yet
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mb-4 text-center max-w-xs">
              Invite your first team member to collaborate on this
              organization.
            </p>
            <Button size="sm" onClick={() => setShowInvite(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Invite Member
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
                  <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = isCurrentUser(member.id);
                  const RoleIcon = roleIcons[member.role] || User;
                  return (
                    <motion.tr
                      key={member.id}
                      variants={staggerItem}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      {/* Member info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {member.avatar_url ? (
                            <img
                              src={member.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div
                              className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(member.id)} flex items-center justify-center text-xs font-medium text-white`}
                            >
                              {getInitials(member.name, member.email)}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {member.name || member.email.split("@")[0]}
                              </span>
                              {isSelf && (
                                <Badge className="bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20 border text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0">
                                  You
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-[var(--text-tertiary)] block">
                              {member.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        {isSelf ? (
                          <Badge
                            className={`${roleBadgeStyles[member.role] || roleBadgeStyles.member} border text-[10px] uppercase tracking-wider font-semibold gap-1`}
                          >
                            <RoleIcon className="w-3 h-3" />
                            {member.role}
                          </Badge>
                        ) : (
                          <div className="relative">
                            {updatingRoleId === member.id ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-tertiary)]" />
                                <span className="text-xs text-[var(--text-tertiary)]">
                                  Updating...
                                </span>
                              </div>
                            ) : (
                              <Select
                                value={member.role}
                                onValueChange={(value: string) =>
                                  handleRoleChange(
                                    member.id,
                                    value as Role
                                  )
                                }
                              >
                                <SelectTrigger className="h-7 w-[110px] bg-transparent border-[var(--border-subtle)] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="owner">
                                    <div className="flex items-center gap-1.5">
                                      <Crown className="w-3 h-3 text-purple-400" />
                                      Owner
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="admin">
                                    <div className="flex items-center gap-1.5">
                                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                                      Admin
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="member">
                                    <div className="flex items-center gap-1.5">
                                      <User className="w-3 h-3 text-zinc-400" />
                                      Member
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Joined date */}
                      <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                        {formatDate(member.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end">
                          {!isSelf ? (
                            <button
                              onClick={() => setRemoveTarget(member)}
                              className="p-1.5 rounded hover:bg-[var(--accent-red)]/10 text-[var(--text-tertiary)] hover:text-[var(--accent-red)] transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              --
                            </span>
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

      {/* Invite Member Dialog */}
      <Dialog
        open={showInvite}
        onOpenChange={(open) => !open && resetInviteDialog()}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)] max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Add a new member to your organization. They will be able to access
              the dashboard based on their assigned role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Name
              </label>
              <Input
                placeholder="e.g., Jane Smith"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="bg-[var(--bg-primary)] border-[var(--border-default)]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Email
              </label>
              <Input
                type="email"
                placeholder="e.g., jane@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-[var(--bg-primary)] border-[var(--border-default)]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Role
              </label>
              <Select
                value={inviteRole}
                onValueChange={(value: string) =>
                  setInviteRole(value as Role)
                }
              >
                <SelectTrigger className="bg-[var(--bg-primary)] border-[var(--border-default)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">
                    <div className="flex items-center gap-2">
                      <Crown className="w-3.5 h-3.5 text-purple-400" />
                      <div>
                        <span className="font-medium">Owner</span>
                        <span className="text-[var(--text-tertiary)] ml-1.5">
                          -- Full access
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                      <div>
                        <span className="font-medium">Admin</span>
                        <span className="text-[var(--text-tertiary)] ml-1.5">
                          -- Manage settings
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="member">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <div>
                        <span className="font-medium">Member</span>
                        <span className="text-[var(--text-tertiary)] ml-1.5">
                          -- View and use
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                Owners have full access. Admins can manage settings. Members can
                view and use the platform.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetInviteDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={
                !inviteEmail.trim() || !inviteName.trim() || inviting
              }
            >
              {inviting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Inviting...
                </span>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Invite Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <DialogContent className="bg-[var(--bg-elevated)] border-[var(--border-default)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--accent-red)]">
              <AlertTriangle className="w-5 h-5" />
              Remove Team Member
            </DialogTitle>
            <DialogDescription>
              This will remove the member from your organization. They will lose
              access to all resources immediately.
            </DialogDescription>
          </DialogHeader>

          {removeTarget && (
            <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3">
                {removeTarget.avatar_url ? (
                  <img
                    src={removeTarget.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(removeTarget.id)} flex items-center justify-center text-xs font-medium text-white`}
                  >
                    {getInitials(removeTarget.name, removeTarget.email)}
                  </div>
                )}
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)] block">
                    {removeTarget.name || removeTarget.email.split("@")[0]}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)] block">
                    {removeTarget.email}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeTarget && handleRemove(removeTarget)}
              disabled={removing}
            >
              {removing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Removing...
                </span>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Remove Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
