"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useChartTheme } from "./use-chart-theme";

interface Slice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: Slice[];
  height?: number;
  innerRadiusRatio?: number;
  formatValue?: (value: number, percent: number) => string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  // angleDeg: 0 = top (12 o'clock), positive = clockwise
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

export function DonutChart({
  data,
  height = 240,
  innerRadiusRatio = 0.62,
}: DonutChartProps) {
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
    const duration = 900;
    function tick(now: number) {
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);
      // Ease out cubic
      setAnimProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  // Donut geometry
  const chartSize = Math.min(height - 16, (containerWidth || 400) * 0.45);
  const cx = chartSize / 2 + 8;
  const cy = chartSize / 2 + 8;
  const outerR = chartSize / 2 - 4;
  const innerR = outerR * innerRadiusRatio;

  const slices = useMemo(() => {
    let cumAngle = 0;
    return data.map((d) => {
      const angle = (d.value / total) * 360;
      const startAngle = cumAngle;
      const endAngle = cumAngle + angle;
      const midAngle = cumAngle + angle / 2;
      cumAngle += angle;
      return { ...d, startAngle, endAngle, midAngle, percent: (d.value / total) * 100 };
    });
  }, [data, total]);

  if (!theme.mounted) {
    return <div ref={containerRef} style={{ height }} className="rounded-lg" />;
  }

  const svgSize = chartSize + 16;
  const legendWidth = (containerWidth || 400) - svgSize - 24;

  return (
    <div
      ref={containerRef}
      style={{
        height,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
      }}
    >
      {/* Donut SVG */}
      <svg width={svgSize} height={svgSize} style={{ flexShrink: 0 }}>
        {/* Background ring */}
        <circle
          cx={cx}
          cy={cy}
          r={(outerR + innerR) / 2}
          fill="none"
          stroke={theme.gridColor}
          strokeWidth={outerR - innerR}
        />

        {/* Slices */}
        {slices.map((slice, i) => {
          const animatedEnd =
            slice.startAngle + (slice.endAngle - slice.startAngle) * animProgress;

          const sweepAngle = animatedEnd - slice.startAngle;
          const largeArc = sweepAngle > 180 ? 1 : 0;

          if (sweepAngle < 0.5) return null;

          // Draw arc clockwise from top (polarToCartesian already maps 0 = top)
          const outerStart = polarToCartesian(cx, cy, outerR, slice.startAngle);
          const outerEnd = polarToCartesian(cx, cy, outerR, animatedEnd);
          const innerEnd = polarToCartesian(cx, cy, innerR, animatedEnd);
          const innerStart = polarToCartesian(cx, cy, innerR, slice.startAngle);

          const path = [
            `M${outerStart.x},${outerStart.y}`,
            `A${outerR},${outerR},0,${largeArc},1,${outerEnd.x},${outerEnd.y}`,
            `L${innerEnd.x},${innerEnd.y}`,
            `A${innerR},${innerR},0,${largeArc},0,${innerStart.x},${innerStart.y}`,
            "Z",
          ].join(" ");

          const isHovered = hoveredIndex === i;

          return (
            <path
              key={i}
              d={path}
              fill={slice.color}
              fillOpacity={isHovered ? 0.95 : 0.8}
              stroke={theme.isDark ? "#0a0a0f" : "#ffffff"}
              strokeWidth={2}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                cursor: "pointer",
                transform: isHovered
                  ? `translate(${Math.cos(((slice.midAngle - 90) * Math.PI) / 180) * 4}px, ${Math.sin(((slice.midAngle - 90) * Math.PI) / 180) * 4}px)`
                  : "translate(0,0)",
                transition: "transform 0.15s ease, fill-opacity 0.15s ease",
              }}
            />
          );
        })}

        {/* Center label */}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fill={theme.textColor}
          fontSize={20}
          fontWeight={700}
          fontFamily="var(--font-inter), sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {total.toLocaleString()}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          fill={theme.textColorFaint}
          fontSize={10}
          fontFamily="var(--font-inter), sans-serif"
        >
          total requests
        </text>
      </svg>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minWidth: 120,
          maxWidth: Math.max(legendWidth, 160),
        }}
      >
        {slices.map((slice, i) => (
          <div
            key={i}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              cursor: "pointer",
              backgroundColor: hoveredIndex === i
                ? theme.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"
                : "transparent",
              transition: "background-color 0.15s ease",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: slice.color,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: theme.tooltipText,
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {slice.label}
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.tooltipText,
                fontVariantNumeric: "tabular-nums",
                flexShrink: 0,
              }}
            >
              {slice.percent.toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip on hover */}
      {hoveredIndex !== null && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12 }}
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.tooltipBg,
            border: `1px solid ${theme.tooltipBorder}`,
            borderRadius: 8,
            padding: "6px 12px",
            pointerEvents: "none",
            zIndex: 20,
            backdropFilter: "blur(12px)",
            boxShadow: theme.isDark
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: slices[hoveredIndex].color,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: theme.tooltipText }}>
            {slices[hoveredIndex].label}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: theme.tooltipText,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {slices[hoveredIndex].value.toLocaleString()} ({slices[hoveredIndex].percent.toFixed(1)}%)
          </span>
        </motion.div>
      )}
    </div>
  );
}
