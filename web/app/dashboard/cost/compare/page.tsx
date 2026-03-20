"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftRight,
  Calculator,
  TrendingDown,
  TrendingUp,
  Zap,
  Crown,
  DollarSign,
  SlidersHorizontal,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import {
  fadeIn,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";
import { SkeletonBlock } from "@/components/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";

// --- Types ---
interface ModelData {
  model: string;
  provider: string;
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  avg_latency_ms: number;
  quality_score: number;
}

type SortKey = "cost" | "quality" | "latency" | "name";

// --- Constants ---
const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: "#10a37f",
  Anthropic: "#d4a574",
  Google: "#4285f4",
  Together: "#ff6b35",
  Groq: "#f55036",
  Mistral: "#ff7000",
};

const MOCK_MODELS: ModelData[] = [
  {
    model: "gpt-4o",
    provider: "OpenAI",
    input_cost_per_1m: 2.5,
    output_cost_per_1m: 10.0,
    avg_latency_ms: 320,
    quality_score: 94.2,
  },
  {
    model: "gpt-4o-mini",
    provider: "OpenAI",
    input_cost_per_1m: 0.15,
    output_cost_per_1m: 0.6,
    avg_latency_ms: 185,
    quality_score: 87.1,
  },
  {
    model: "claude-3-5-sonnet",
    provider: "Anthropic",
    input_cost_per_1m: 3.0,
    output_cost_per_1m: 15.0,
    avg_latency_ms: 280,
    quality_score: 95.8,
  },
  {
    model: "claude-3-5-haiku",
    provider: "Anthropic",
    input_cost_per_1m: 0.8,
    output_cost_per_1m: 4.0,
    avg_latency_ms: 140,
    quality_score: 88.5,
  },
  {
    model: "gemini-1.5-pro",
    provider: "Google",
    input_cost_per_1m: 1.25,
    output_cost_per_1m: 5.0,
    avg_latency_ms: 350,
    quality_score: 91.3,
  },
  {
    model: "llama-3.1-70b",
    provider: "Together",
    input_cost_per_1m: 0.88,
    output_cost_per_1m: 0.88,
    avg_latency_ms: 410,
    quality_score: 85.7,
  },
  {
    model: "mixtral-8x7b",
    provider: "Groq",
    input_cost_per_1m: 0.24,
    output_cost_per_1m: 0.24,
    avg_latency_ms: 95,
    quality_score: 79.4,
  },
  {
    model: "mistral-large",
    provider: "Mistral",
    input_cost_per_1m: 2.0,
    output_cost_per_1m: 6.0,
    avg_latency_ms: 260,
    quality_score: 89.6,
  },
];

// --- Helpers ---
function getBlendedCost(m: ModelData): number {
  return (m.input_cost_per_1m + m.output_cost_per_1m) / 2;
}

function getLatencyColor(ms: number): string {
  if (ms < 200) return "#22c55e";
  if (ms < 400) return "#f59e0b";
  return "#ef4444";
}

function getLatencyLabel(ms: number): string {
  if (ms < 200) return "Fast";
  if (ms < 400) return "Medium";
  return "Slow";
}

function getQualityColor(score: number): string {
  if (score >= 92) return "#22c55e";
  if (score >= 85) return "#3b82f6";
  return "#f59e0b";
}

function computeTags(models: ModelData[]): Record<string, string[]> {
  const tags: Record<string, string[]> = {};
  models.forEach((m) => (tags[m.model] = []));

  // Best Value = highest quality / blended cost ratio
  const byValue = [...models].sort(
    (a, b) =>
      b.quality_score / getBlendedCost(b) -
      a.quality_score / getBlendedCost(a)
  );
  if (byValue.length > 0) tags[byValue[0].model].push("Best Value");

  // Fastest
  const bySpeed = [...models].sort(
    (a, b) => a.avg_latency_ms - b.avg_latency_ms
  );
  if (bySpeed.length > 0) tags[bySpeed[0].model].push("Fastest");

  // Highest Quality
  const byQuality = [...models].sort(
    (a, b) => b.quality_score - a.quality_score
  );
  if (byQuality.length > 0) tags[byQuality[0].model].push("Highest Quality");

  return tags;
}

// --- Skeleton Loading ---
function ComparePageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Chart skeleton */}
      <div
        className="rounded-xl border p-6"
        style={{
          background: "#12121e",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <SkeletonBlock className="h-5 w-48 mb-2" />
        <SkeletonBlock className="h-3 w-72 mb-6" />
        <SkeletonBlock className="h-[320px] w-full rounded-lg" />
      </div>
      {/* Filter skeleton */}
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-24 rounded-lg" />
        ))}
        <div className="ml-auto">
          <SkeletonBlock className="h-8 w-32 rounded-lg" />
        </div>
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border p-5"
            style={{
              background: "#12121e",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <SkeletonBlock className="h-4 w-28 mb-3" />
            <SkeletonBlock className="h-5 w-20 mb-4" />
            <SkeletonBlock className="h-3 w-full mb-2" />
            <SkeletonBlock className="h-3 w-full mb-2" />
            <SkeletonBlock className="h-2 w-full mb-4 rounded-full" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        ))}
      </div>
      {/* Calculator skeleton */}
      <div
        className="rounded-xl border p-6"
        style={{
          background: "#12121e",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <SkeletonBlock className="h-5 w-40 mb-4" />
        <SkeletonBlock className="h-32 w-full rounded-lg" />
      </div>
    </div>
  );
}

// --- Scatter / Bubble Chart (SVG) ---
function CostQualityChart({
  models,
  hoveredModel,
  onHover,
}: {
  models: ModelData[];
  hoveredModel: string | null;
  onHover: (model: string | null) => void;
}) {
  const chartW = 800;
  const chartH = 340;
  const pad = { top: 30, right: 40, bottom: 50, left: 60 };
  const innerW = chartW - pad.left - pad.right;
  const innerH = chartH - pad.top - pad.bottom;

  // Scales
  const costs = models.map(getBlendedCost);
  const qualities = models.map((m) => m.quality_score);
  const latencies = models.map((m) => m.avg_latency_ms);

  const costMin = 0;
  const costMax = Math.ceil(Math.max(...costs) + 1);
  const qualMin = Math.floor(Math.min(...qualities) - 3);
  const qualMax = Math.ceil(Math.max(...qualities) + 2);
  const latMin = Math.min(...latencies);
  const latMax = Math.max(...latencies);

  function xScale(v: number) {
    return pad.left + ((v - costMin) / (costMax - costMin)) * innerW;
  }
  function yScale(v: number) {
    return pad.top + ((qualMax - v) / (qualMax - qualMin)) * innerH;
  }
  function rScale(v: number) {
    const minR = 10;
    const maxR = 28;
    return minR + ((v - latMin) / (latMax - latMin || 1)) * (maxR - minR);
  }

  // Grid lines
  const xTicks: number[] = [];
  for (let i = costMin; i <= costMax; i += 2) xTicks.push(i);
  if (!xTicks.includes(costMax)) xTicks.push(costMax);

  const yTicks: number[] = [];
  for (let i = Math.ceil(qualMin); i <= qualMax; i += 3) yTicks.push(i);

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full"
        style={{ minWidth: 600 }}
      >
        {/* Background */}
        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          rx={8}
          fill="#0d0d18"
        />

        {/* Grid lines */}
        {xTicks.map((t) => (
          <line
            key={`xg-${t}`}
            x1={xScale(t)}
            y1={pad.top}
            x2={xScale(t)}
            y2={pad.top + innerH}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}
        {yTicks.map((t) => (
          <line
            key={`yg-${t}`}
            x1={pad.left}
            y1={yScale(t)}
            x2={pad.left + innerW}
            y2={yScale(t)}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}

        {/* X axis labels */}
        {xTicks.map((t) => (
          <text
            key={`xl-${t}`}
            x={xScale(t)}
            y={chartH - 8}
            textAnchor="middle"
            fill="#71717a"
            fontSize={11}
            fontFamily="Inter, sans-serif"
          >
            ${t}
          </text>
        ))}

        {/* Y axis labels */}
        {yTicks.map((t) => (
          <text
            key={`yl-${t}`}
            x={pad.left - 12}
            y={yScale(t) + 4}
            textAnchor="end"
            fill="#71717a"
            fontSize={11}
            fontFamily="Inter, sans-serif"
          >
            {t}
          </text>
        ))}

        {/* Axis titles */}
        <text
          x={pad.left + innerW / 2}
          y={chartH - -2}
          textAnchor="middle"
          fill="#a1a1aa"
          fontSize={11}
          fontFamily="Inter, sans-serif"
          fontWeight={500}
        >
          Avg Cost per 1M tokens ($)
        </text>
        <text
          x={14}
          y={pad.top + innerH / 2}
          textAnchor="middle"
          fill="#a1a1aa"
          fontSize={11}
          fontFamily="Inter, sans-serif"
          fontWeight={500}
          transform={`rotate(-90, 14, ${pad.top + innerH / 2})`}
        >
          Quality Score
        </text>

        {/* "Better" quadrant hint */}
        <text
          x={pad.left + 12}
          y={pad.top + 18}
          fill="rgba(34,197,94,0.3)"
          fontSize={10}
          fontFamily="Inter, sans-serif"
          fontWeight={600}
          style={{ textTransform: "uppercase", letterSpacing: 1 }}
        >
          LOW COST, HIGH QUALITY
        </text>

        {/* Bubbles */}
        {models.map((m) => {
          const cx = xScale(getBlendedCost(m));
          const cy = yScale(m.quality_score);
          const r = rScale(m.avg_latency_ms);
          const color = PROVIDER_COLORS[m.provider] || "#71717a";
          const isHovered = hoveredModel === m.model;
          const isOtherHovered = hoveredModel !== null && !isHovered;

          return (
            <g
              key={m.model}
              onMouseEnter={() => onHover(m.model)}
              onMouseLeave={() => onHover(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Glow ring on hover */}
              {isHovered && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 4}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  opacity={0.5}
                >
                  <animate
                    attributeName="r"
                    values={`${r + 3};${r + 7};${r + 3}`}
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.5;0.15;0.5"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* Main bubble */}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                fillOpacity={isOtherHovered ? 0.12 : 0.22}
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeOpacity={isOtherHovered ? 0.3 : 0.8}
                style={{
                  transition: "all 0.2s ease",
                }}
              />
              {/* Label */}
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isOtherHovered ? "rgba(255,255,255,0.2)" : "#fafafa"}
                fontSize={r > 16 ? 9 : 8}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={500}
                style={{
                  transition: "fill 0.2s ease",
                  pointerEvents: "none",
                }}
              >
                {m.model.length > 12
                  ? m.model.replace("claude-3-5-", "c3.5-").replace("gpt-4o-", "4o-").replace("gemini-1.5-", "gem-").replace("llama-3.1-", "ll-").replace("mixtral-", "mix-").replace("mistral-", "mis-")
                  : m.model}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Chart Legend ---
function ChartLegend({ models }: { models: ModelData[] }) {
  const providers = Array.from(new Set(models.map((m) => m.provider)));
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4">
      {providers.map((p) => (
        <div key={p} className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: PROVIDER_COLORS[p] || "#71717a" }}
          />
          <span className="text-xs text-[#a1a1aa]">{p}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 ml-4 pl-4 border-l border-[rgba(255,255,255,0.08)]">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="4" fill="none" stroke="#71717a" strokeWidth="1" />
        </svg>
        <span className="text-[10px] text-[#71717a] uppercase tracking-wider">
          Bubble size = latency
        </span>
      </div>
    </div>
  );
}

// --- Filter Bar ---
function FilterBar({
  providers,
  activeProviders,
  onToggleProvider,
  sortKey,
  onSortChange,
}: {
  providers: string[];
  activeProviders: Set<string>;
  onToggleProvider: (p: string) => void;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
}) {
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "quality", label: "Quality" },
    { key: "cost", label: "Cost" },
    { key: "latency", label: "Latency" },
    { key: "name", label: "Name" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Provider filter chips */}
      <div className="flex items-center gap-1.5 mr-2">
        <SlidersHorizontal className="w-3.5 h-3.5 text-[#71717a] mr-1" />
        <span className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium">
          Providers
        </span>
      </div>
      {providers.map((p) => {
        const isActive = activeProviders.has(p);
        const color = PROVIDER_COLORS[p] || "#71717a";
        return (
          <button
            key={p}
            onClick={() => onToggleProvider(p)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              background: isActive
                ? `${color}18`
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${isActive ? `${color}40` : "rgba(255,255,255,0.06)"}`,
              color: isActive ? color : "#71717a",
            }}
          >
            <div
              className="w-2 h-2 rounded-full transition-all duration-200"
              style={{
                backgroundColor: isActive ? color : "#3f3f46",
              }}
            />
            {p}
            {isActive && (
              <Check className="w-3 h-3 ml-0.5" style={{ color }} />
            )}
          </button>
        );
      })}

      {/* Sort */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium mr-1">
          Sort by
        </span>
        {sortOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200"
            style={{
              background:
                sortKey === opt.key
                  ? "rgba(59,130,246,0.15)"
                  : "transparent",
              color:
                sortKey === opt.key ? "#3b82f6" : "#71717a",
              border:
                sortKey === opt.key
                  ? "1px solid rgba(59,130,246,0.25)"
                  : "1px solid transparent",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Model Card ---
function ModelCard({
  model,
  tags,
  isHovered,
  onHover,
}: {
  model: ModelData;
  tags: string[];
  isHovered: boolean;
  onHover: (model: string | null) => void;
}) {
  const color = PROVIDER_COLORS[model.provider] || "#71717a";
  const latColor = getLatencyColor(model.avg_latency_ms);
  const qualColor = getQualityColor(model.quality_score);

  const tagConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    "Best Value": {
      icon: <DollarSign className="w-3 h-3" />,
      color: "#22c55e",
    },
    Fastest: {
      icon: <Zap className="w-3 h-3" />,
      color: "#3b82f6",
    },
    "Highest Quality": {
      icon: <Crown className="w-3 h-3" />,
      color: "#f59e0b",
    },
  };

  return (
    <motion.div
      variants={staggerItem}
      onMouseEnter={() => onHover(model.model)}
      onMouseLeave={() => onHover(null)}
      className="relative group rounded-xl border transition-all duration-300"
      style={{
        background: isHovered ? "#161626" : "#12121e",
        borderColor: isHovered
          ? `${color}30`
          : "rgba(255,255,255,0.06)",
        boxShadow: isHovered
          ? `0 0 30px ${color}08, 0 4px 20px rgba(0,0,0,0.3)`
          : "none",
      }}
    >
      {/* Tags */}
      {tags.length > 0 && (
        <div className="absolute -top-2.5 left-4 flex gap-1.5">
          {tags.map((tag) => {
            const cfg = tagConfig[tag];
            return (
              <div
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: `${cfg?.color || "#71717a"}20`,
                  border: `1px solid ${cfg?.color || "#71717a"}35`,
                  color: cfg?.color || "#71717a",
                }}
              >
                {cfg?.icon}
                {tag}
              </div>
            );
          })}
        </div>
      )}

      <div className="p-5 pt-4">
        {/* Header: Model name + Provider badge */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#fafafa] font-mono">
              {model.model}
            </h3>
          </div>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${color}15`,
              color: color,
              border: `1px solid ${color}25`,
            }}
          >
            {model.provider}
          </span>
        </div>

        {/* Cost row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#71717a] mb-1">
              Input / 1M
            </div>
            <div className="text-sm font-semibold text-[#fafafa]">
              ${model.input_cost_per_1m.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#71717a] mb-1">
              Output / 1M
            </div>
            <div className="text-sm font-semibold text-[#fafafa]">
              ${model.output_cost_per_1m.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Latency */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#71717a]">
              Avg Latency
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="text-xs font-semibold"
                style={{ color: latColor }}
              >
                {model.avg_latency_ms}ms
              </span>
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  background: `${latColor}15`,
                  color: latColor,
                }}
              >
                {getLatencyLabel(model.avg_latency_ms)}
              </span>
            </div>
          </div>
          {/* Latency bar */}
          <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((model.avg_latency_ms / 500) * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className="h-full rounded-full"
              style={{ backgroundColor: latColor }}
            />
          </div>
        </div>

        {/* Quality Score */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#71717a]">
              Quality Score
            </span>
            <span
              className="text-xs font-bold"
              style={{ color: qualColor }}
            >
              {model.quality_score.toFixed(1)}
            </span>
          </div>
          {/* Quality progress bar */}
          <div className="h-2 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${model.quality_score}%` }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${qualColor}cc, ${qualColor})`,
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// --- What-if Calculator ---
function WhatIfCalculator({ models }: { models: ModelData[] }) {
  const [currentModel, setCurrentModel] = useState(models[0]?.model || "");
  const [targetModel, setTargetModel] = useState(
    models.length > 1 ? models[1].model : ""
  );
  const [monthlyInputTokens, setMonthlyInputTokens] = useState(10);
  const [monthlyOutputTokens, setMonthlyOutputTokens] = useState(5);

  const current = models.find((m) => m.model === currentModel);
  const target = models.find((m) => m.model === targetModel);

  const currentCost = current
    ? (monthlyInputTokens * current.input_cost_per_1m +
        monthlyOutputTokens * current.output_cost_per_1m)
    : 0;
  const targetCost = target
    ? (monthlyInputTokens * target.input_cost_per_1m +
        monthlyOutputTokens * target.output_cost_per_1m)
    : 0;
  const diff = currentCost - targetCost;
  const pctChange = currentCost > 0 ? (diff / currentCost) * 100 : 0;
  const isSaving = diff > 0;

  const qualityDiff = target && current ? target.quality_score - current.quality_score : 0;
  const latencyDiff = target && current ? target.avg_latency_ms - current.avg_latency_ms : 0;

  return (
    <div
      className="rounded-xl border p-6"
      style={{
        background: "#12121e",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{
            background: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.2)",
          }}
        >
          <Calculator className="w-4.5 h-4.5 text-[#3b82f6]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#fafafa]">
            What-if Calculator
          </h3>
          <p className="text-xs text-[#71717a]">
            Estimate cost impact of switching models
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_1fr] gap-6 items-start">
        {/* Model selectors + token inputs */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium block mb-1.5">
              Current Model
            </label>
            <select
              value={currentModel}
              onChange={(e) => setCurrentModel(e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm font-mono text-[#fafafa] appearance-none cursor-pointer outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {models.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium block mb-1.5">
              Target Model
            </label>
            <select
              value={targetModel}
              onChange={(e) => setTargetModel(e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm font-mono text-[#fafafa] appearance-none cursor-pointer outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {models.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden lg:flex items-center justify-center pt-8">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <ArrowRight className="w-4 h-4 text-[#71717a]" />
          </div>
        </div>

        {/* Token volume inputs */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium block mb-1.5">
              Monthly Input Tokens (millions)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={monthlyInputTokens}
              onChange={(e) =>
                setMonthlyInputTokens(Math.max(0.1, parseFloat(e.target.value) || 0.1))
              }
              className="w-full h-9 rounded-lg px-3 text-sm text-[#fafafa] outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[#71717a] font-medium block mb-1.5">
              Monthly Output Tokens (millions)
            </label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={monthlyOutputTokens}
              onChange={(e) =>
                setMonthlyOutputTokens(Math.max(0.1, parseFloat(e.target.value) || 0.1))
              }
              className="w-full h-9 rounded-lg px-3 text-sm text-[#fafafa] outline-none"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          {/* Cost comparison */}
          <div
            className="rounded-lg p-4"
            style={{
              background: isSaving
                ? "rgba(34,197,94,0.06)"
                : diff === 0
                ? "rgba(255,255,255,0.03)"
                : "rgba(239,68,68,0.06)",
              border: `1px solid ${
                isSaving
                  ? "rgba(34,197,94,0.15)"
                  : diff === 0
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(239,68,68,0.15)"
              }`,
            }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[#71717a] mb-1">
              Projected Monthly Change
            </div>
            <div className="flex items-center gap-2">
              {isSaving ? (
                <TrendingDown className="w-4 h-4 text-[#22c55e]" />
              ) : diff === 0 ? (
                <ArrowLeftRight className="w-4 h-4 text-[#71717a]" />
              ) : (
                <TrendingUp className="w-4 h-4 text-[#ef4444]" />
              )}
              <span
                className="text-lg font-bold"
                style={{
                  color: isSaving
                    ? "#22c55e"
                    : diff === 0
                    ? "#a1a1aa"
                    : "#ef4444",
                }}
              >
                {isSaving ? "-" : diff === 0 ? "" : "+"}$
                {Math.abs(diff).toFixed(2)}
              </span>
              {pctChange !== 0 && (
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{
                    background: isSaving
                      ? "rgba(34,197,94,0.12)"
                      : "rgba(239,68,68,0.12)",
                    color: isSaving ? "#22c55e" : "#ef4444",
                  }}
                >
                  {isSaving ? "" : "+"}
                  {(-pctChange).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-[#71717a]">
              <span>
                Current: ${currentCost.toFixed(2)}/mo
              </span>
              <span>
                Target: ${targetCost.toFixed(2)}/mo
              </span>
            </div>
          </div>

          {/* Quality & Latency impact */}
          <div className="grid grid-cols-2 gap-2">
            <div
              className="rounded-lg p-3"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="text-[9px] uppercase tracking-wider text-[#71717a] mb-0.5">
                Quality
              </div>
              <span
                className="text-xs font-semibold"
                style={{
                  color:
                    qualityDiff > 0
                      ? "#22c55e"
                      : qualityDiff < 0
                      ? "#ef4444"
                      : "#a1a1aa",
                }}
              >
                {qualityDiff > 0 ? "+" : ""}
                {qualityDiff.toFixed(1)}
              </span>
            </div>
            <div
              className="rounded-lg p-3"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div className="text-[9px] uppercase tracking-wider text-[#71717a] mb-0.5">
                Latency
              </div>
              <span
                className="text-xs font-semibold"
                style={{
                  color:
                    latencyDiff < 0
                      ? "#22c55e"
                      : latencyDiff > 0
                      ? "#ef4444"
                      : "#a1a1aa",
                }}
              >
                {latencyDiff > 0 ? "+" : ""}
                {latencyDiff}ms
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function ModelComparePage() {
  const [loading, setLoading] = useState(true);
  const [activeProviders, setActiveProviders] = useState<Set<string>>(
    new Set(Object.keys(PROVIDER_COLORS))
  );
  const [sortKey, setSortKey] = useState<SortKey>("quality");
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  const allProviders = useMemo(
    () => Array.from(new Set(MOCK_MODELS.map((m) => m.provider))),
    []
  );

  const toggleProvider = useCallback(
    (p: string) => {
      setActiveProviders((prev) => {
        const next = new Set(prev);
        if (next.has(p)) {
          // Don't allow deselecting all
          if (next.size > 1) next.delete(p);
        } else {
          next.add(p);
        }
        return next;
      });
    },
    []
  );

  const filteredModels = useMemo(() => {
    let result = MOCK_MODELS.filter((m) => activeProviders.has(m.provider));
    switch (sortKey) {
      case "cost":
        result = [...result].sort(
          (a, b) => getBlendedCost(a) - getBlendedCost(b)
        );
        break;
      case "quality":
        result = [...result].sort(
          (a, b) => b.quality_score - a.quality_score
        );
        break;
      case "latency":
        result = [...result].sort(
          (a, b) => a.avg_latency_ms - b.avg_latency_ms
        );
        break;
      case "name":
        result = [...result].sort((a, b) =>
          a.model.localeCompare(b.model)
        );
        break;
    }
    return result;
  }, [activeProviders, sortKey]);

  const tags = useMemo(() => computeTags(filteredModels), [filteredModels]);

  const isEmpty = !loading && MOCK_MODELS.length === 0;

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
      style={{ background: "#0a0a0f", minHeight: "100vh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <Sparkles className="w-4 h-4 text-[#3b82f6]" />
            </div>
            <h1 className="text-xl font-semibold text-[#fafafa]">
              Model Comparison
            </h1>
          </div>
          <p className="text-sm text-[#a1a1aa] ml-11">
            Compare cost, latency, and quality across models and providers
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && <ComparePageSkeleton />}

      {/* Empty State */}
      {isEmpty && (
        <div
          className="rounded-xl border p-16 text-center"
          style={{
            background: "#12121e",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "rgba(59,130,246,0.1)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <ArrowLeftRight className="w-6 h-6 text-[#3b82f6]" />
          </div>
          <h3 className="text-sm font-medium text-[#fafafa] mb-1">
            No model data available
          </h3>
          <p className="text-xs text-[#71717a] max-w-sm mx-auto">
            Model comparison data will populate as requests flow through the
            gateway.
          </p>
        </div>
      )}

      {/* Main Content */}
      {!loading && filteredModels.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Scatter Chart */}
          <motion.div
            variants={staggerItem}
            className="rounded-xl border p-6"
            style={{
              background: "#12121e",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa] mb-0.5">
                Cost vs Quality Overview
              </h3>
              <p className="text-xs text-[#71717a]">
                Bubble size represents average latency. Hover for details.
              </p>
            </div>
            <TooltipProvider>
              <CostQualityChart
                models={filteredModels}
                hoveredModel={hoveredModel}
                onHover={setHoveredModel}
              />
            </TooltipProvider>
            <ChartLegend models={filteredModels} />
          </motion.div>

          {/* Filter Bar */}
          <motion.div variants={staggerItem}>
            <FilterBar
              providers={allProviders}
              activeProviders={activeProviders}
              onToggleProvider={toggleProvider}
              sortKey={sortKey}
              onSortChange={setSortKey}
            />
          </motion.div>

          {/* Model Cards Grid */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredModels.map((model) => (
                <ModelCard
                  key={model.model}
                  model={model}
                  tags={tags[model.model] || []}
                  isHovered={hoveredModel === model.model}
                  onHover={setHoveredModel}
                />
              ))}
            </AnimatePresence>
          </motion.div>

          {/* What-if Calculator */}
          <motion.div variants={staggerItem}>
            <WhatIfCalculator models={MOCK_MODELS} />
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
