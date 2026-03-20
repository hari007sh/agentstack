"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

// --- Types ---

export interface SpanData {
  id: string;
  name: string;
  span_type: "llm_call" | "tool_call" | "retrieval" | "chain" | "agent" | "custom";
  start_time: string; // ISO timestamp
  end_time: string;   // ISO timestamp
  parent_id?: string | null;
  depth?: number;
  model?: string;
  tokens?: { input: number; output: number };
  status?: "completed" | "failed" | "running" | "healed";
  metadata?: Record<string, unknown>;
}

export interface HealingMarker {
  id: string;
  timestamp: string; // ISO timestamp
  intervention_type: string;
  description: string;
}

interface SessionReplayProps {
  spans: SpanData[];
  healingMarkers?: HealingMarker[];
}

// --- Color map ---

const spanTypeColors: Record<string, string> = {
  llm_call: "var(--accent-blue)",   // blue
  tool_call: "var(--accent-green)",  // green
  retrieval: "var(--accent-purple)",  // purple
  chain: "var(--accent-amber)",      // amber
  agent: "var(--healing-blue)",      // cyan
  custom: "var(--text-tertiary)",     // gray
};

// --- Helpers ---

function computeDepth(spans: SpanData[]): SpanData[] {
  const idMap = new Map<string, SpanData>();
  const result: SpanData[] = spans.map((s) => ({ ...s, depth: 0 }));
  result.forEach((s) => idMap.set(s.id, s));

  result.forEach((s) => {
    let depth = 0;
    let current = s;
    while (current.parent_id && idMap.has(current.parent_id)) {
      depth++;
      current = idMap.get(current.parent_id)!;
    }
    s.depth = depth;
  });

  return result;
}

function formatDuration(ms: number): string {
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// Tooltip state for React-managed tooltip
interface TooltipInfo {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  lines: Array<{ label: string; value: string; color?: string }>;
}

// --- Component ---

export function SessionReplay({ spans, healingMarkers = [] }: SessionReplayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    title: "",
    subtitle: "",
    lines: [],
  });

  // Observe container width for responsiveness
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || spans.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const enrichedSpans = computeDepth(spans);

    // Sort by start time, then by depth
    enrichedSpans.sort((a, b) => {
      const ta = new Date(a.start_time).getTime();
      const tb = new Date(b.start_time).getTime();
      if (ta !== tb) return ta - tb;
      return (a.depth ?? 0) - (b.depth ?? 0);
    });

    // Dimensions
    const margin = { top: 24, right: 20, bottom: 24, left: 180 };
    const rowHeight = 32;
    const rowGap = 4;
    const chartHeight = margin.top + enrichedSpans.length * (rowHeight + rowGap) + margin.bottom;
    const chartWidth = containerWidth;
    const innerWidth = chartWidth - margin.left - margin.right;

    svg.attr("width", chartWidth).attr("height", chartHeight);

    // Time scale
    const sessionStart = d3.min(enrichedSpans, (d) => new Date(d.start_time).getTime()) ?? 0;
    const sessionEnd = d3.max(enrichedSpans, (d) => new Date(d.end_time).getTime()) ?? 1;

    const xScale = d3
      .scaleLinear()
      .domain([sessionStart, sessionEnd])
      .range([0, innerWidth]);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Grid lines
    const ticks = xScale.ticks(6);
    g.selectAll(".grid-line")
      .data(ticks)
      .join("line")
      .attr("class", "grid-line")
      .attr("x1", (d) => xScale(d))
      .attr("x2", (d) => xScale(d))
      .attr("y1", 0)
      .attr("y2", enrichedSpans.length * (rowHeight + rowGap))
      .attr("stroke", "var(--border-subtle)")
      .attr("stroke-dasharray", "2,4");

    // Time axis labels
    g.selectAll(".time-label")
      .data(ticks)
      .join("text")
      .attr("class", "time-label")
      .attr("x", (d) => xScale(d))
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--text-tertiary)")
      .attr("font-size", "10px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text((d) => formatDuration(d - sessionStart));

    // Span rows
    const rows = g
      .selectAll(".span-row")
      .data(enrichedSpans)
      .join("g")
      .attr("class", "span-row")
      .attr("transform", (_d, i) => `translate(0,${i * (rowHeight + rowGap)})`);

    // Span labels (left side)
    svg
      .selectAll(".span-label")
      .data(enrichedSpans)
      .join("text")
      .attr("class", "span-label")
      .attr("x", margin.left - 8)
      .attr("y", (_d, i) => margin.top + i * (rowHeight + rowGap) + rowHeight / 2 + 4)
      .attr("text-anchor", "end")
      .attr("fill", "var(--text-secondary)")
      .attr("font-size", "11px")
      .attr("font-family", "'Inter', sans-serif")
      .text((d) => {
        const indent = "\u00A0\u00A0".repeat(d.depth ?? 0);
        const name = d.name.length > 18 ? d.name.substring(0, 16) + ".." : d.name;
        return indent + name;
      });

    // Span bars
    rows
      .append("rect")
      .attr("x", (d) => xScale(new Date(d.start_time).getTime()))
      .attr("y", 2)
      .attr("width", (d) => {
        const w = xScale(new Date(d.end_time).getTime()) - xScale(new Date(d.start_time).getTime());
        return Math.max(w, 3); // Minimum 3px bar width
      })
      .attr("height", rowHeight - 4)
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", (d) => spanTypeColors[d.span_type] ?? spanTypeColors.custom)
      .attr("opacity", 0.85)
      .attr("cursor", "pointer")
      .on("mouseenter", function (event: MouseEvent, d: SpanData) {
        d3.select(this).attr("opacity", 1).attr("stroke", "var(--text-primary)").attr("stroke-width", 1);
        const durationMs = new Date(d.end_time).getTime() - new Date(d.start_time).getTime();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let left = event.clientX - rect.left + 12;
        const top = Math.max(event.clientY - rect.top - 10, 4);
        if (left + 220 > rect.width) left = event.clientX - rect.left - 230;

        const lines: Array<{ label: string; value: string; color?: string }> = [
          { label: "Duration", value: formatDuration(durationMs) },
        ];
        if (d.model) lines.push({ label: "Model", value: d.model });
        if (d.tokens) lines.push({ label: "Tokens", value: `${d.tokens.input} in / ${d.tokens.output} out` });
        if (d.status) {
          const statusColor =
            d.status === "completed" ? "var(--accent-green)"
              : d.status === "failed" ? "var(--accent-red)"
              : d.status === "healed" ? "var(--healing-blue)"
              : "var(--accent-blue)";
          lines.push({ label: "Status", value: d.status, color: statusColor });
        }

        setTooltip({
          visible: true,
          x: left,
          y: top,
          title: d.name,
          subtitle: d.span_type.replace("_", " "),
          lines,
        });
      })
      .on("mousemove", function (event: MouseEvent) {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let left = event.clientX - rect.left + 12;
        const top = Math.max(event.clientY - rect.top - 10, 4);
        if (left + 220 > rect.width) left = event.clientX - rect.left - 230;
        setTooltip((prev) => ({ ...prev, x: left, y: top }));
      })
      .on("mouseleave", function () {
        d3.select(this).attr("opacity", 0.85).attr("stroke", "none");
        hideTooltip();
      });

    // Status indicator (failed = red border)
    rows
      .filter((d) => d.status === "failed")
      .append("rect")
      .attr("x", (d) => xScale(new Date(d.start_time).getTime()) - 1)
      .attr("y", 1)
      .attr("width", (d) => {
        const w = xScale(new Date(d.end_time).getTime()) - xScale(new Date(d.start_time).getTime());
        return Math.max(w, 3) + 2;
      })
      .attr("height", rowHeight - 2)
      .attr("rx", 5)
      .attr("ry", 5)
      .attr("fill", "none")
      .attr("stroke", "var(--accent-red)")
      .attr("stroke-width", 1.5)
      .attr("pointer-events", "none");

    // Healing intervention markers (cyan diamonds)
    if (healingMarkers.length > 0) {
      const markerSize = 8;
      const diamondPath = d3.symbol().type(d3.symbolDiamond).size(markerSize * markerSize);

      const markerG = g.append("g").attr("class", "healing-markers");

      markerG
        .selectAll(".healing-diamond")
        .data(healingMarkers)
        .join("path")
        .attr("class", "healing-diamond")
        .attr("d", diamondPath)
        .attr("transform", (d) => {
          const x = xScale(new Date(d.timestamp).getTime());
          const totalHeight = enrichedSpans.length * (rowHeight + rowGap);
          return `translate(${x},${totalHeight + 4})`;
        })
        .attr("fill", "var(--healing-blue)")
        .attr("stroke", "var(--bg-primary)")
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("mouseenter", function (event: MouseEvent, d: HealingMarker) {
          d3.select(this).attr("fill", "#7dd3fc");
          const container = containerRef.current;
          if (!container) return;
          const rect = container.getBoundingClientRect();
          let left = event.clientX - rect.left + 12;
          const top = Math.max(event.clientY - rect.top - 10, 4);
          if (left + 220 > rect.width) left = event.clientX - rect.left - 230;
          setTooltip({
            visible: true,
            x: left,
            y: top,
            title: "Healing Intervention",
            subtitle: d.intervention_type,
            lines: [
              { label: "Details", value: d.description },
            ],
          });
        })
        .on("mouseleave", function () {
          d3.select(this).attr("fill", "var(--healing-blue)");
          hideTooltip();
        });

      // Vertical lines for healing markers
      markerG
        .selectAll(".healing-line")
        .data(healingMarkers)
        .join("line")
        .attr("class", "healing-line")
        .attr("x1", (d) => xScale(new Date(d.timestamp).getTime()))
        .attr("x2", (d) => xScale(new Date(d.timestamp).getTime()))
        .attr("y1", 0)
        .attr("y2", enrichedSpans.length * (rowHeight + rowGap))
        .attr("stroke", "var(--healing-blue)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,3")
        .attr("opacity", 0.4)
        .attr("pointer-events", "none");
    }
  }, [spans, healingMarkers, containerWidth, hideTooltip]);

  if (spans.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-12 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">No spans to display</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 overflow-x-auto"
    >
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-3 px-1">
        {Object.entries(spanTypeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              {type.replace("_", " ")}
            </span>
          </div>
        ))}
        {healingMarkers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path
                d="M6 1 L11 6 L6 11 L1 6 Z"
                fill="var(--healing-blue)"
                stroke="var(--bg-primary)"
                strokeWidth="0.5"
              />
            </svg>
            <span className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              Healing
            </span>
          </div>
        )}
      </div>

      <svg ref={svgRef} className="w-full" />

      {/* React-managed Tooltip (no innerHTML) */}
      {tooltip.visible && (
        <div
          className="absolute pointer-events-none dark:bg-[rgba(10,10,11,0.95)] bg-[rgba(255,255,255,0.95)] dark:border-[rgba(255,255,255,0.1)] border-[var(--border-default)] dark:text-[#fafafa] text-[var(--text-primary)]"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            backdropFilter: "blur(8px)",
            borderRadius: "8px",
            borderWidth: "1px",
            borderStyle: "solid",
            padding: "10px 14px",
            fontSize: "12px",
            maxWidth: "240px",
            lineHeight: "1.6",
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltip.title}</div>
          <div
            style={{
              color: tooltip.title === "Healing Intervention" ? "var(--healing-blue)" : "var(--text-tertiary)",
              fontSize: "10px",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {tooltip.subtitle}
          </div>
          {tooltip.lines.map((line, i) => (
            <div key={i}>
              <span style={{ color: "var(--text-tertiary)" }}>{line.label}:</span>{" "}
              <span style={{ color: line.color ?? "var(--text-primary)" }}>{line.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
