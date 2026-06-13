"use client";

import { useMemo } from "react";

export const LEVEL_COLOR: Record<string, string> = {
  success: "#21d4a8",
  running: "#5b8cff",
  pending: "#f5a524",
  info: "#93a0c4",
  error: "#ff5d73",
};

export function levelColor(level: string): string {
  return LEVEL_COLOR[level] ?? "#93a0c4";
}

export function trendColor(trend: string): string {
  return trend === "up" ? "#21d4a8" : trend === "down" ? "#ff5d73" : "#93a0c4";
}

export function trendArrow(trend: string): string {
  return trend === "up" ? "▲" : trend === "down" ? "▼" : "■";
}

export function fmtTime(ts: string | null): string {
  if (!ts) return "--:--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Tiny inline SVG sparkline.
export function Sparkline({
  data,
  color = "#5b8cff",
  width = 64,
  height = 20,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return "";
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const span = max - min || 1;
    const step = width / (data.length - 1);
    return data
      .map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / span) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [data, width, height]);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ height: 5, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
}
