"use client";

import type { AgentPerformance, Mission, WorkstreamAgent } from "../types";
import { STATUS_COLOR } from "../scene/sceneConfig";
import { Bar, Sparkline, trendArrow, trendColor } from "./ui";

// Agent detail panel — opens when an employee is clicked in the 3D office.
// Shows runtime status, performance-market standing, automation split and the
// active mission, with a one-tap dispatch for any runnable work it owns.
export function AgentPanel({
  agent,
  perf,
  missions,
  onRun,
  onClose,
  busy,
}: {
  agent: WorkstreamAgent;
  perf: AgentPerformance | undefined;
  missions: Mission[];
  onRun: (taskId: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const color = STATUS_COLOR[agent.status];
  const owned = missions.filter((m) => m.agentId === agent.id);
  const runnable = owned.find((m) => m.runnable);

  return (
    <div className="bx-panel" style={{ pointerEvents: "auto", width: 312, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: color, marginTop: 4, boxShadow: `0 0 10px ${color}` }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--bx-text)" }}>{agent.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--bx-muted)" }}>
            {agent.role} · {agent.laneLabel}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--bx-muted)", cursor: "pointer", fontSize: 16 }}>
          ✕
        </button>
      </div>

      {perf && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--bx-muted)", letterSpacing: "0.1em" }}>성과 점수</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "var(--bx-text)", lineHeight: 1.1 }}>{perf.score}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: trendColor(perf.trend) }}>
            {trendArrow(perf.trend)} {perf.delta > 0 ? "+" : ""}
            {perf.delta} ({perf.deltaPercent > 0 ? "+" : ""}
            {perf.deltaPercent}%)
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 10, color: "var(--bx-muted)" }}>랭킹</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--bx-accent)" }}>#{perf.rank}</div>
          </div>
        </div>
      )}
      {perf && <div style={{ marginTop: 8 }}><Sparkline data={perf.spark} color={trendColor(perf.trend)} width={280} height={34} /></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
        <Metric label="에너지" value={`${agent.energy}`} bar={agent.energy} color={color} />
        {perf && <Metric label="처리량" value={`${perf.workload}`} bar={perf.workload} color="#5b8cff" />}
        {perf && <Metric label="자동화" value={`${perf.automationRatio}%`} bar={perf.automationRatio} color="#21d4a8" />}
        {perf && <Metric label="사람 개입" value={`${perf.humanRatio}%`} bar={perf.humanRatio} color="#f5a524" />}
      </div>

      <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--bx-muted)", lineHeight: 1.45 }}>
        <span style={{ color: "var(--bx-text)", fontWeight: 700 }}>상태:</span> {agent.focus}
        {agent.activeMission ? (
          <>
            <br />
            <span style={{ color: "var(--bx-text)", fontWeight: 700 }}>활성 미션:</span> {agent.activeMission}
          </>
        ) : null}
      </div>

      {agent.capabilities.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
          {agent.capabilities.slice(0, 6).map((c) => (
            <span key={c} className="bx-chip" style={{ color: "var(--bx-muted)" }}>
              {c}
            </span>
          ))}
        </div>
      )}

      {runnable && (
        <button
          onClick={() => onRun(runnable.taskId)}
          disabled={busy}
          style={{
            marginTop: 14,
            width: "100%",
            padding: "11px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#5b8cff,#21d4a8)",
            color: "#06121f",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "디스패치 중…" : `▸ ${runnable.title} 실행`}
        </button>
      )}
    </div>
  );
}

function Metric({ label, value, bar, color }: { label: string; value: string; bar: number; color: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 10.5, color: "var(--bx-muted)" }}>{label}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bx-text)" }}>{value}</span>
      </div>
      <Bar value={bar} color={color} />
    </div>
  );
}
