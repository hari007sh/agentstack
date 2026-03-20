"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useChartTheme } from "./use-chart-theme";

interface DataPoint {
  label: string;
  value: number;
}

let lineChartCounter = 0;

interface LineChartProps {
  data: DataPoint[];
  color: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
  formatValue?: (value: number) => string;
  showGrid?: boolean;
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

export function LineChart({
  data,
  color,
  height = 192,
  valuePrefix = "",
  valueSuffix = "",
  formatValue,
  showGrid = true,
}: LineChartProps) {
  const theme = useChartTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animProgress, setAnimProgress] = useState(0);
  const [clipId] = useState(() => `line-clip-${++lineChartCounter}`);
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

  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const svgWidth = containerWidth || 600;
  const svgHeight = height;
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const { points, minVal, maxVal, yTicks } = useMemo(() => {
    if (data.length === 0) return { points: [], minVal: 0, maxVal: 100, yTicks: [] };
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const yPad = range * 0.15;
    const yMin = Math.max(0, min - yPad);
    const yMax = max + yPad;

    const pts = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartWidth,
      y: padding.top + (1 - (d.value - yMin) / (yMax - yMin)) * chartHeight,
    }));

    const ticks: number[] = [];
    for (let i = 0; i < 4; i++) {
      ticks.push(yMin + ((yMax - yMin) * i) / 3);
    }

    return { points: pts, minVal: yMin, maxVal: yMax, yTicks: ticks };
  }, [data, chartWidth, chartHeight, padding.left, padding.top]);

  const linePath = useMemo(() => monotoneCubic(points), [points]);

  const displayValue = (val: number) => {
    if (formatValue) return formatValue(val);
    return `${valuePrefix}${val.toLocaleString(undefined, { maximumFractionDigits: 1 })}${valueSuffix}`;
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
          <clipPath id={clipId}>
            <rect
              x={padding.left}
              y={padding.top}
              width={chartWidth * animProgress}
              height={chartHeight}
            />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {showGrid &&
          yTicks.map((tick, i) => {
            const y = padding.top + (1 - (tick - minVal) / (maxVal - minVal || 1)) * chartHeight;
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
                  {tick.toFixed(1)}%
                </text>
              </g>
            );
          })}

        {/* X-axis labels */}
        {data.map((d, i) => {
          const x = padding.left + (i / (data.length - 1)) * chartWidth;
          return (
            <text
              key={i}
              x={x}
              y={svgHeight - 4}
              textAnchor="middle"
              fill={theme.textColorFaint}
              fontSize={10}
              fontFamily="var(--font-inter), sans-serif"
            >
              {d.label}
            </text>
          );
        })}

        {/* Subtle area under line */}
        {linePath && points.length > 0 && (
          <path
            d={`${linePath}L${points[points.length - 1].x},${padding.top + chartHeight}L${points[0].x},${padding.top + chartHeight}Z`}
            fill={color}
            fillOpacity={0.06}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* Hover areas & dots */}
        {points.map((pt, i) => {
          const stepW = chartWidth / (data.length - 1);
          return (
            <g key={i}>
              <rect
                x={i === 0 ? padding.left : pt.x - stepW / 2}
                y={padding.top}
                width={i === 0 || i === data.length - 1 ? stepW / 2 + (i === 0 ? 0 : stepW / 2) : stepW}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: "crosshair" }}
              />
              {hoveredIndex === i && (
                <line
                  x1={pt.x}
                  y1={padding.top}
                  x2={pt.x}
                  y2={padding.top + chartHeight}
                  stroke={theme.gridColor}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={hoveredIndex === i ? 5 : 3}
                fill={color}
                stroke={theme.isDark ? "#1e1e3a" : "#ffffff"}
                strokeWidth={2}
                opacity={animProgress}
                style={{ transition: "r 0.15s ease" }}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute",
            left: Math.min(
              Math.max(points[hoveredIndex].x - 60, 4),
              containerWidth - 130
            ),
            top: Math.max(points[hoveredIndex].y - 56, 4),
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
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: theme.tooltipSubtext,
              marginBottom: 2,
            }}
          >
            {data[hoveredIndex].label}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: theme.tooltipText,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {displayValue(data[hoveredIndex].value)}
          </div>
        </motion.div>
      )}
    </div>
  );
}
