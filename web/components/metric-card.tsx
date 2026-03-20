"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { staggerItem } from "@/lib/animations";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number;
  format?: "number" | "percent" | "currency" | "duration";
  change?: number; // percentage change
  icon?: LucideIcon;
  color?: "blue" | "green" | "red" | "amber" | "purple" | "cyan";
  loading?: boolean;
  /** Optional: "large" renders a taller bento card */
  size?: "default" | "large";
}

const colorMap = {
  blue: "var(--accent-blue)",
  green: "var(--accent-green)",
  red: "var(--accent-red)",
  amber: "var(--accent-amber)",
  purple: "var(--accent-purple)",
  cyan: "var(--healing-blue)",
};

const glowShadowMap: Record<string, string> = {
  blue: "0 0 20px -5px rgba(59,130,246,0.15)",
  green: "0 0 20px -5px rgba(34,197,94,0.15)",
  red: "0 0 20px -5px rgba(239,68,68,0.15)",
  amber: "0 0 20px -5px rgba(245,158,11,0.15)",
  purple: "0 0 20px -5px rgba(168,85,247,0.15)",
  cyan: "0 0 20px -5px rgba(56,189,248,0.15)",
};

// Simple sparkline data (deterministic from value for consistency)
function generateSparkline(value: number): number[] {
  const seed = Math.abs(value) % 100;
  const points: number[] = [];
  let current = seed;
  for (let i = 0; i < 12; i++) {
    current = current + ((Math.sin(i * 1.3 + seed * 0.1) * 15) + (Math.cos(i * 0.7) * 8));
    points.push(Math.max(5, Math.min(95, current)));
  }
  // Normalize to 0-100 range
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  return points.map((p) => ((p - min) / range) * 100);
}

function SparklineSVG({ data, color }: { data: number[]; color: string }) {
  const width = 80;
  const height = 28;
  const padding = 2;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  // Generate a unique gradient ID based on color to avoid SVG ID collisions
  const gradientId = `spark-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * innerWidth;
      const y = padding + innerHeight - (v / 100) * innerHeight;
      return `${x},${y}`;
    })
    .join(" ");

  // Create area fill path
  const firstX = padding;
  const lastX = padding + innerWidth;
  const areaPath = `M${firstX},${padding + innerHeight} L${data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * innerWidth;
      const y = padding + innerHeight - (v / 100) * innerHeight;
      return `${x},${y}`;
    })
    .join(" L")} L${lastX},${padding + innerHeight} Z`;

  return (
    <svg width={width} height={height} className="opacity-70 dark:opacity-60">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "currency":
      return `$${(value / 100).toFixed(2)}`;
    case "duration":
      if (value < 1000) return `${value}ms`;
      return `${(value / 1000).toFixed(1)}s`;
    default:
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toLocaleString();
  }
}

export function MetricCard({
  title,
  value,
  format = "number",
  change,
  icon: Icon,
  color = "blue",
  loading = false,
  size = "default",
}: MetricCardProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const sparklineData = generateSparkline(value);
  const accentColor = colorMap[color];

  useEffect(() => {
    if (loading) return;
    const duration = 600;
    const startTime = performance.now();
    const startValue = 0;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + (value - startValue) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [value, loading]);

  if (loading) {
    return (
      <motion.div
        variants={staggerItem}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5"
      >
        <div className="skeleton-shimmer h-4 w-24 rounded mb-3" />
        <div className="skeleton-shimmer h-8 w-32 rounded mb-2" />
        <div className="skeleton-shimmer h-3 w-16 rounded" />
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        "group relative rounded-xl glass gradient-border shine-hover overflow-hidden transition-all duration-200",
        size === "large" ? "p-6" : "p-4"
      )}
      whileHover={{
        y: -2,
        boxShadow: glowShadowMap[color] || glowShadowMap.blue,
        transition: { duration: 0.15 },
      }}
    >
      {/* Subtle accent glow in corner */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${accentColor}15, transparent 70%)`,
        }}
      />

      <div className="relative z-[3]">
        <div className="flex items-start justify-between mb-2.5">
          <p className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
            {title}
          </p>
          {Icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}08)`,
              }}
            >
              <Icon className="w-4 h-4" style={{ color: accentColor }} />
            </div>
          )}
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p
              className={cn(
                "font-semibold tracking-tight tabular-nums",
                size === "large" ? "text-3xl" : "text-2xl"
              )}
            >
              {formatValue(displayValue, format)}
            </p>
            {change !== undefined && (
              <p
                className={cn(
                  "text-[11px] mt-1 font-medium tabular-nums",
                  change >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
                )}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(1)}% from last period
              </p>
            )}
          </div>

          {/* Sparkline */}
          <div className="flex-shrink-0 ml-3 mb-0.5">
            <SparklineSVG data={sparklineData} color={accentColor} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
