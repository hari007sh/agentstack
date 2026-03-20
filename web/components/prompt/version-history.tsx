"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { cn } from "@/lib/utils";

export interface PromptVersion {
  version: number;
  change_note: string;
  created_at: string;
  is_active: boolean;
  author: string;
}

interface VersionHistoryProps {
  versions: PromptVersion[];
  onSelectVersion?: (version: number) => void;
  selectedVersion?: number;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistory({
  versions,
  onSelectVersion,
  selectedVersion,
}: VersionHistoryProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="relative"
    >
      {/* Timeline line */}
      <div className="absolute left-[11px] top-4 bottom-4 w-px bg-[var(--border-subtle)]" />

      <div className="space-y-1">
        {versions.map((v) => {
          const isSelected = selectedVersion === v.version;
          return (
            <motion.div
              key={v.version}
              variants={staggerItem}
              onClick={() => onSelectVersion?.(v.version)}
              className={cn(
                "relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                isSelected
                  ? "bg-[var(--bg-hover)]"
                  : "hover:bg-[var(--bg-hover)]"
              )}
            >
              {/* Timeline dot */}
              <div className="relative z-10 mt-0.5 flex-shrink-0">
                <div
                  className={cn(
                    "w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center",
                    v.is_active
                      ? "border-[var(--accent-green)] bg-[var(--accent-green)]/20"
                      : "border-[var(--border-default)] bg-[var(--bg-secondary)]"
                  )}
                >
                  {v.is_active && (
                    <div className="w-2 h-2 rounded-full bg-[var(--accent-green)]" />
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold font-mono">
                    v{v.version}
                  </span>
                  {v.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-green)]/10 text-[var(--accent-green)] font-medium">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-1 line-clamp-2">
                  {v.change_note}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {v.author}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    &middot;
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {formatTimestamp(v.created_at)}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
