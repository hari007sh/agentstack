"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return {
    mounted,
    isDark,
    gridColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
    textColor: isDark ? "#8888a0" : "#6b7280",
    textColorFaint: isDark ? "#555570" : "#9ca3af",
    tooltipBg: isDark ? "#1e1e3a" : "#ffffff",
    tooltipBorder: isDark ? "#2a2a4a" : "rgba(0,0,0,0.1)",
    tooltipText: isDark ? "#f0f0f5" : "#111113",
    tooltipSubtext: isDark ? "#8888a0" : "#6b7280",
  };
}
