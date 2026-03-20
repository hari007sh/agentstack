"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useChartTheme } from "./use-chart-theme";

interface Series {
  name: string;
  color: string;
  data: number[];
}

interface StackedAreaChartProps {
  labels: string[];
  series: Series[];
  height?: number;
  formatValue?: (value: number) => string;
}

function monotoneCubic(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    dy.push(points[i + 1].y - points[i].y);
    m.push(dy[i] / dx[i]);
  }

  const tangents: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push((m[i - 1] + m[i]) / 2);
    }
  }
  tangents.push(m[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / m[i];
      const beta = tangents[i + 1] / m[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        tangents[i] = t * alpha * m[i];
        tangents[i + 1] = t * beta * m[i];
      }
    }
  }

  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    const cp1x = points[i].x + d;
    const cp1y = points[i].y + tangents[i] * d;
    const cp2x = points[i + 1].x - d;
    const cp2y = points[i + 1].y - tangents[i + 1] * d;
    path += `C${cp1x},${cp1y},${cp2x},${cp2y},${points[i + 1].x},${points[i + 1].y}`;
  }

  return path;
}

function reverseMonotonePath(points: { x: number; y: number }[]): string {
  const reversed = [...points].reverse();
  return monotoneCubic(reversed).replace(/^M/, "L");
}

export function StackedAreaChart({
  labels,
  series,
  height = 192,
  formatValue,
}: StackedAreaChartProps) {
  const theme = useChartTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let frame: number;
    const start = performance.now();
    const duration = 800;
    function tick(now: number) {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      setAnimProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const svgWidth = containerWidth || 600;
  const svgHeight = height;
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;
  const n = labels.length;

  // Compute cumulative stacks
  const { stacks, maxVal, yTicks } = useMemo(() => {
    if (n === 0) return { stacks: [], maxVal: 100, yTicks: [] };

    // stacks[seriesIndex][pointIndex] = { bottom, top }
    const stackData: { bottom: number; top: number }[][] = [];
    for (let s = 0; s < series.length; s++) {
      const layer: { bottom: number; top: number }[] = [];
      for (let i = 0; i < n; i++) {
        const bottom = s === 0 ? 0 : stackData[s - 1][i].top;
        const top = bottom + series[s].data[i];
        layer.push({ bottom, top });
      }
      stackData.push(layer);
    }

    const max = Math.max(...stackData[stackData.length - 1].map((d) => d.top));
    const yMax = max * 1.1;

    const ticks: number[] = [];
    for (let i = 0; i < 4; i++) {
      ticks.push((yMax * i) / 3);
    }

    return { stacks: stackData, maxVal: yMax, yTicks: ticks };
  }, [series, n]);

  const xScale = (i: number) => padding.left + (i / (n - 1)) * chartWidth;
  const yScale = (v: number) => padding.top + (1 - v / maxVal) * chartHeight;

  const displayValue = (val: number) => {
    if (formatValue) return formatValue(val);
    return `$${(val / 100).toFixed(2)}`;
  };

  if (!theme.mounted) {
    return <div ref={containerRef} style={{ height }} className="rounded-lg" />;
  }

  return (
    <div ref={containerRef} style={{ height, position: "relative" }}>
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        <defs>
          {series.map((s, idx) => (
            <linearGradient key={idx} id={`stack-grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
          <clipPath id="stack-clip">
            <rect
              x={padding.left}
              y={padding.top}
              width={chartWidth * animProgress}
              height={chartHeight}
            />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = yScale(tick);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={padding.left + chartWidth}
                y2={y}
                stroke={theme.gridColor}
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fill={theme.textColorFaint}
                fontSize={10}
                fontFamily="var(--font-inter), sans-serif"
              >
                {displayValue(tick)}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={svgHeight - 4}
            textAnchor="middle"
            fill={theme.textColorFaint}
            fontSize={10}
            fontFamily="var(--font-inter), sans-serif"
          >
            {label}
          </text>
        ))}

        {/* Stacked areas — render bottom to top */}
        {stacks.map((layer, sIdx) => {
          const topPoints = layer.map((d, i) => ({ x: xScale(i), y: yScale(d.top) }));
          const bottomPoints = layer.map((d, i) => ({ x: xScale(i), y: yScale(d.bottom) }));

          const topPath = monotoneCubic(topPoints);
          const bottomPath = reverseMonotonePath(bottomPoints);

          if (!topPath || !bottomPath) return null;

          const areaPath = `${topPath}${bottomPath}Z`;

          return (
            <g key={sIdx} clipPath="url(#stack-clip)">
              <path d={areaPath} fill={`url(#stack-grad-${sIdx})`} />
              <path
                d={topPath}
                fill="none"
                stroke={series[sIdx].color}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.8}
              />
            </g>
          );
        })}

        {/* Hover zones */}
        {labels.map((_, i) => {
          const stepW = chartWidth / (n - 1);
          const rectX = i === 0 ? padding.left : xScale(i) - stepW / 2;
          const rectW = i === 0 || i === n - 1 ? stepW / 2 + (i === 0 ? 0 : stepW / 2) : stepW;
          return (
            <g key={i}>
              <rect
                x={rectX}
                y={padding.top}
                width={rectW}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: "crosshair" }}
              />
              {hoveredIndex === i && (
                <line
                  x1={xScale(i)}
                  y1={padding.top}
                  x2={xScale(i)}
                  y2={padding.top + chartHeight}
                  stroke={theme.gridColor}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute",
            left: Math.min(Math.max(xScale(hoveredIndex) - 80, 4), containerWidth - 180),
            top: 8,
            background: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            borderRadius: 8,
            padding: "8px 12px",
            pointerEvents: "none",
            zIndex: 20,
            backdropFilter: "blur(12px)",
            boxShadow: theme.isDark
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.08)",
            minWidth: 140,
          }}
        >
          <div style={{ fontSize: 10, color: theme.tooltipSubtext, marginBottom: 6 }}>
            {labels[hoveredIndex]}
          </div>
          {series.map((s, sIdx) => (
            <div
              key={sIdx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: s.color,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: theme.tooltipSubtext, flex: 1 }}>
                {s.name}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.tooltipText,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {displayValue(s.data[hoveredIndex])}
              </span>
            </div>
          ))}
          <div
            style={{
              borderTop: `1px solid ${theme.tooltipBorder}`,
              marginTop: 4,
              paddingTop: 4,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 11, color: theme.tooltipSubtext }}>Total</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: theme.tooltipText,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {displayValue(series.reduce((sum, s) => sum + s.data[hoveredIndex], 0))}
            </span>
          </div>
        </motion.div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          justifyContent: "center",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {series.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: s.color,
              }}
            />
            <span style={{ fontSize: 11, color: theme.textColor }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
