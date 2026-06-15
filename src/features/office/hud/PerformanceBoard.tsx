"use client";

import type { AgentPerformance, Workstream } from "../types";
import { Bar, Sparkline, trendArrow, trendColor } from "./ui";

export function PerformanceBoard({ workstream }: { workstream: Workstream | null }) {
  const performers = workstream?.agentPerformance.slice(0, 5) ?? [];
  const watchlist = workstream?.watchlist.slice(0, 3) ?? [];
  const indices = workstream?.market.indices.slice(0, 3) ?? [];
  const strategy = workstream?.agentOpsStrategy ?? null;
  const strategyLanes = strategy?.laneHealth.filter((lane) => lane.health !== "healthy").slice(0, 2) ?? [];
  const milestones = strategy?.operatingMilestones.slice(0, 3) ?? [];

  if (!workstream) return null;

  return (
    <div className="bx-panel" style={{ pointerEvents: "auto", width: 374, padding: 14, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--bx-accent)", fontWeight: 900, letterSpacing: "0.13em" }}>AGENT PERFORMANCE</div>
          <div style={{ fontSize: 11.5, color: "var(--bx-muted)", marginTop: 2 }}>업무 성과 · 자동화/사람 개입 · 관심 에이전트</div>
        </div>
        <span className="bx-chip" style={{ color: "var(--bx-accent-2)" }}>LIVE</span>
      </div>

      {strategy && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 14, background: "linear-gradient(135deg, rgba(91,140,255,0.12), rgba(33,212,168,0.07))", border: "1px solid rgba(91,140,255,0.22)" }}>
          <div style={{ fontSize: 10, color: "var(--bx-accent)", fontWeight: 900, letterSpacing: "0.12em" }}>OPS STRATEGY</div>
          <div style={{ fontSize: 12.5, color: "var(--bx-text)", fontWeight: 800, marginTop: 4 }}>{strategy.headline}</div>
          <div style={{ fontSize: 10.5, color: "var(--bx-muted)", lineHeight: 1.45, marginTop: 3 }}>{strategy.principle}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 9 }}>
            {(strategyLanes.length ? strategyLanes : strategy.laneHealth.slice(0, 2)).map((lane) => (
              <div key={lane.lane} style={{ padding: 8, borderRadius: 11, background: "rgba(8,12,24,0.34)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 850 }}>{lane.label}</span>
                  <span style={{ fontSize: 9.5, color: healthColor(lane.health), fontWeight: 900 }}>{healthLabel(lane.health)}</span>
                </div>
                <div style={{ fontSize: 9.5, color: "var(--bx-muted)", marginTop: 3 }}>{lane.capacityLabel}</div>
                <div style={{ fontSize: 10, color: "var(--bx-text)", marginTop: 5, lineHeight: 1.35 }}>{lane.nextAction}</div>
              </div>
            ))}
          </div>
          {milestones.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
              {milestones.map((m) => (
                <span key={m.id} className="bx-chip" title={m.meaning} style={{ color: m.status === "done" ? "var(--bx-accent-2)" : "var(--bx-text)" }}>
                  {m.status === "done" ? "✓" : "○"} {m.label} {m.done}/{m.total}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 7, marginTop: 12 }}>
        {indices.map((idx) => (
          <div key={idx.id} style={{ padding: 9, borderRadius: 12, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(120,150,220,0.13)" }}>
            <div style={{ fontSize: 9.5, color: "var(--bx-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idx.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 3 }}>
              <span style={{ fontSize: 18, fontWeight: 900 }}>{idx.value}</span>
              <span style={{ fontSize: 9.5, color: "var(--bx-muted)" }}>{idx.unit}</span>
            </div>
            <div style={{ fontSize: 10, color: trendColor(idx.trend), fontWeight: 800 }}>{trendArrow(idx.trend)} {idx.deltaPercent > 0 ? "+" : ""}{idx.deltaPercent}%</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
        {performers.map((p) => <AgentRow key={p.id} performer={p} />)}
      </div>

      {watchlist.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--bx-border)" }}>
          <div style={{ fontSize: 10.5, color: "var(--bx-muted)", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 7 }}>WATCHLIST</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {watchlist.map((w) => (
              <span key={w.id} className="bx-chip" style={{ color: "var(--bx-text)" }}>★ {w.name} · {w.score}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function healthLabel(health: "healthy" | "watch" | "gap") {
  if (health === "gap") return "GAP";
  if (health === "watch") return "WATCH";
  return "READY";
}

function healthColor(health: "healthy" | "watch" | "gap") {
  if (health === "gap") return "var(--bx-warn)";
  if (health === "watch") return "var(--bx-accent)";
  return "var(--bx-accent-2)";
}

function AgentRow({ performer }: { performer: AgentPerformance }) {
  const color = trendColor(performer.trend);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px minmax(0, 1fr) 64px", gap: 8, alignItems: "center", padding: "8px 9px", borderRadius: 12, background: "rgba(255,255,255,0.028)", border: "1px solid rgba(120,150,220,0.12)" }}>
      <div style={{ width: 24, height: 24, borderRadius: 9, display: "grid", placeItems: "center", background: performer.rank === 1 ? "rgba(33,212,168,0.18)" : "rgba(91,140,255,0.13)", color: performer.rank === 1 ? "var(--bx-accent-2)" : "var(--bx-accent)", fontSize: 11, fontWeight: 900 }}>
        {performer.rank}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--bx-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{performer.name}</span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color }}>{performer.deltaPercent > 0 ? "+" : ""}{performer.deltaPercent}%</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 5 }}>
          <Bar value={performer.automationRatio} color="var(--bx-accent-2)" />
          <Bar value={performer.humanRatio} color="var(--bx-warn)" />
        </div>
        <div style={{ fontSize: 9.5, color: "var(--bx-muted)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {performer.laneLabel} · 처리량 {performer.workload} · {performer.summary}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span style={{ fontSize: 19, fontWeight: 950, lineHeight: 1 }}>{performer.score}</span>
        <Sparkline data={performer.spark} color={color} width={56} height={18} />
      </div>
    </div>
  );
}
