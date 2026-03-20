"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Crown,
  ShieldCheck,
  User,
  Clock,
  Construction,
} from "lucide-react";
import { fadeIn, staggerContainer, staggerItem } from "@/lib/animations";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { SkeletonTable } from "@/components/skeleton";

type Role = "owner" | "admin" | "member" | "viewer";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: Role;
  org_id: string;
  created_at: string;
  updated_at: string;
}

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
  viewer: User,
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

export default function TeamPage() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const initToken = useCallback(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      api.setToken(token);
    }
    return !!token;
  }, []);

  // Try to parse current user from JWT (the JWT payload contains user info)
  useEffect(() => {
    if (!initToken()) {
      setLoading(false);
      return;
    }

    // Parse user info from the stored token
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setCurrentUser({
          id: payload.sub || payload.user_id || "",
          name: payload.name || "",
          email: payload.email || "",
          avatar_url: payload.avatar_url || "",
          role: (payload.role as Role) || "member",
          org_id: payload.org_id || "",
          created_at: payload.iat
            ? new Date(payload.iat * 1000).toISOString()
            : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      // JWT parsing failed — user might not be logged in
    }
    setLoading(false);
  }, [initToken]);

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
            Manage team members, roles, and invitations
          </p>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <SkeletonTable rows={3} cols={4} />
        </div>
      )}

      {/* Current User Card */}
      {!loading && currentUser && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Your Account
            </h3>
          </div>
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
                </tr>
              </thead>
              <tbody>
                <motion.tr
                  variants={staggerItem}
                  className="hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {currentUser.avatar_url ? (
                        <img
                          src={currentUser.avatar_url}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColors[0]} flex items-center justify-center text-xs font-medium text-white`}
                        >
                          {getInitials(
                            currentUser.name,
                            currentUser.email
                          )}
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-[var(--text-primary)] block">
                          {currentUser.name || "You"}
                        </span>
                        <span className="text-[11px] text-[var(--text-tertiary)] block">
                          {currentUser.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {(() => {
                      const role = currentUser.role;
                      const RoleIcon = roleIcons[role] || User;
                      return (
                        <Badge
                          className={`${roleBadgeStyles[role] || roleBadgeStyles.member} border text-[10px] uppercase tracking-wider font-semibold gap-1`}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {role}
                        </Badge>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)]">
                    {formatDate(currentUser.created_at)}
                  </td>
                </motion.tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Coming Soon: Team Management */}
      <motion.div
        variants={staggerItem}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-10"
      >
        <div className="flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[var(--accent-purple)]/10 flex items-center justify-center mb-5">
            <Construction className="w-7 h-7 text-[var(--accent-purple)]" />
          </div>
          <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">
            Team Management Coming Soon
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
            Invite team members, assign roles, and manage access controls for
            your organization. This feature is currently under development and
            will be available in an upcoming release.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            {[
              {
                icon: Users,
                label: "Invite Members",
                description: "Send email invitations",
              },
              {
                icon: ShieldCheck,
                label: "Role Management",
                description: "Owner, Admin, Member, Viewer",
              },
              {
                icon: Clock,
                label: "Activity Tracking",
                description: "See who did what, when",
              },
            ].map((feature) => (
              <div
                key={feature.label}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 opacity-60"
              >
                <feature.icon className="w-4 h-4 text-[var(--text-tertiary)] mb-2" />
                <p className="text-xs font-medium text-[var(--text-primary)] mb-0.5">
                  {feature.label}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
