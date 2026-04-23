"use client";

import { useId } from "react";

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = "var(--hx-accent)",
  fill = true,
  strokeWidth = 1.5,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const gradId = useId();
  if (!data || data.length < 2) {
    // Render a flat placeholder line so spacing stays stable while a series
    // is still accreting (we only have 1 sample per poll).
    return (
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "visible" }}
      >
        <line
          x1={0}
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map(
    (v, i) => [i * step, height - ((v - min) / range) * (height - 4) - 2] as const,
  );
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
    >
      {fill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
