"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface ReliabilityScoreProps {
  score: number; // 0-100
  size?: number;
  loading?: boolean;
}

export function ReliabilityScore({ score, size = 120, loading = false }: ReliabilityScoreProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    if (loading) return;
    const duration = 800;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(score * eased);
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }, [score, loading]);

  const getColor = (s: number) => {
    if (s >= 90) return "var(--accent-green)";
    if (s >= 70) return "var(--accent-amber)";
    return "var(--accent-red)";
  };

  if (loading) {
    return (
      <div
        className="skeleton-shimmer rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(animatedScore)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.3s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{Math.round(animatedScore)}</span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
          Score
        </span>
      </div>
    </motion.div>
  );
}
