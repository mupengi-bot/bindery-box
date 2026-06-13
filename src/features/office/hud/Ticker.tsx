"use client";

import type { AgentPerformance, MarketIndex } from "../types";
import { Sparkline, trendArrow, trendColor } from "./ui";

// Agent Performance Market ticker — a securities-style scrolling band of
// composite indices + per-agent 업무 성과 scores. Pure performance/automation
// vocabulary (no financial terms), matching the control-plane projection.
export function Ticker({
  indices,
  performers,
}: {
  indices: MarketIndex[];
  performers: AgentPerformance[];
}) {
  const items = [
    ...indices.map((idx) => ({
      key: `idx_${idx.id}`,
      label: idx.label,
      value: `${idx.value}${idx.unit}`,
      delta: idx.delta,
      deltaPercent: idx.deltaPercent,
      trend: idx.trend,
      spark: idx.spark,
      strong: true,
    })),
    ...performers.map((p) => ({
      key: `perf_${p.id}`,
      label: `#${p.rank} ${p.name}`,
      value: `${p.score}`,
      delta: p.delta,
      deltaPercent: p.deltaPercent,
      trend: p.trend,
      spark: p.spark,
      strong: false,
    })),
  ];
  if (items.length === 0) return null;
  const doubled = [...items, ...items];

  return (
    <div
      style={{
        pointerEvents: "auto",
        overflow: "hidden",
        borderTop: "1px solid var(--bx-border)",
        borderBottom: "1px solid var(--bx-border)",
        background: "rgba(8,12,24,0.78)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 26,
          padding: "8px 16px",
          whiteSpace: "nowrap",
          animation: "bx-marquee 46s linear infinite",
        }}
      >
        {doubled.map((it, i) => (
          <span key={`${it.key}_${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: it.strong ? 800 : 600, color: it.strong ? "#cdd9ff" : "#9fb0d8", letterSpacing: "0.02em" }}>
              {it.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#eaf0ff" }}>{it.value}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: trendColor(it.trend) }}>
              {trendArrow(it.trend)} {it.delta > 0 ? "+" : ""}
              {it.delta}
              {it.deltaPercent ? ` (${it.deltaPercent > 0 ? "+" : ""}${it.deltaPercent}%)` : ""}
            </span>
            <Sparkline data={it.spark} color={trendColor(it.trend)} width={44} height={16} />
          </span>
        ))}
      </div>
    </div>
  );
}
