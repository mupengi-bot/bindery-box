"use client";

import { useMemo, useState } from "react";
import { LANE_ZONES } from "../scene/sceneConfig";
import type { LaneId, Mission } from "../types";
import { levelColor } from "./ui";

// Goal Composer with progressive disclosure:
//   collapsed → a single command pill
//   level 1  → intent input + the runnable missions it matches (one-tap dispatch)
//   level 2  → full mission board with lane filter, priority and approval flags
export function GoalComposer({
  missions,
  onRun,
  onReseed,
  busy,
}: {
  missions: Mission[];
  onRun: (taskId: string) => void;
  onReseed: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [intent, setIntent] = useState("");
  const [lane, setLane] = useState<LaneId | "all">("all");

  const runnable = useMemo(() => missions.filter((m) => m.runnable), [missions]);

  const matches = useMemo(() => {
    const q = intent.trim().toLowerCase();
    let pool = lane === "all" ? missions : missions.filter((m) => m.lane === lane);
    if (q) pool = pool.filter((m) => `${m.title} ${m.laneLabel} ${m.agent}`.toLowerCase().includes(q));
    return pool;
  }, [missions, intent, lane]);

  if (!open) {
    return (
      <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center" }}>
        <button
          onClick={() => setOpen(true)}
          className="bx-panel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "11px 22px",
            cursor: "pointer",
            color: "var(--bx-text)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <span style={{ fontSize: 16, color: "var(--bx-accent)" }}>＋</span>
          목표·명령 입력
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--bx-muted)" }}>
            에이전트에게 미션을 디스패치
          </span>
        </button>
      </div>
    );
  }

  const runFirst = () => {
    const target = matches.find((m) => m.runnable) ?? runnable[0];
    if (target) onRun(target.taskId);
  };

  return (
    <div className="bx-panel" style={{ pointerEvents: "auto", width: "min(680px, 92vw)", padding: 16, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", color: "var(--bx-accent)" }}>
          GOAL COMPOSER
        </span>
        <span style={{ fontSize: 11, color: "var(--bx-muted)" }}>· 목표를 적고 매칭된 미션을 디스패치하세요</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setAdvanced((v) => !v)} style={ghostBtn}>
            {advanced ? "간단히" : "고급"}
          </button>
          <button onClick={() => setOpen(false)} style={ghostBtn}>
            닫기
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runFirst()}
          placeholder="예: 생산 납기 리스크 요약 / 미응답 고객 후속 / Scope 3 데이터 확보"
          style={{
            flex: 1,
            background: "rgba(8,12,24,0.7)",
            border: "1px solid var(--bx-border)",
            borderRadius: 10,
            padding: "11px 14px",
            color: "var(--bx-text)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          onClick={runFirst}
          disabled={busy || (matches.length === 0 && runnable.length === 0)}
          style={{
            ...primaryBtn,
            opacity: busy || (matches.length === 0 && runnable.length === 0) ? 0.5 : 1,
          }}
        >
          {busy ? "디스패치 중…" : "디스패치 ▸"}
        </button>
      </div>

      {advanced && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <Pill active={lane === "all"} onClick={() => setLane("all")} label={`전체 (${missions.length})`} />
          {(Object.keys(LANE_ZONES) as LaneId[]).map((l) => (
            <Pill
              key={l}
              active={lane === l}
              onClick={() => setLane(l)}
              label={`${LANE_ZONES[l].glyph} ${LANE_ZONES[l].label.split(" · ")[0]}`}
              color={LANE_ZONES[l].color}
            />
          ))}
        </div>
      )}

      <div className="bx-scroll" style={{ marginTop: 12, maxHeight: 184, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--bx-muted)", padding: "8px 4px" }}>
            매칭되는 미션이 없습니다. 회사를 재구성하려면 우측 상단 Reseed를 사용하세요.
          </div>
        )}
        {matches.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 11px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--bx-border)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 999, background: levelColor(m.level), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--bx-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {m.laneGlyph} {m.title}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--bx-muted)", marginTop: 2 }}>
                {m.agent} · {m.laneLabel} · {m.status}
                {m.requiresApproval ? " · 승인필요" : ""}
                {advanced && m.priority !== "normal" ? ` · ${m.priority}` : ""}
              </div>
            </div>
            {m.runnable ? (
              <button onClick={() => onRun(m.taskId)} disabled={busy} style={miniBtn}>
                실행
              </button>
            ) : (
              <span style={{ fontSize: 10, color: "var(--bx-muted)" }}>{m.status}</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onReseed} style={ghostBtn}>
          ↻ 데모 회사 재구성 (Reseed)
        </button>
      </div>
    </div>
  );
}

function Pill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        color: active ? "#fff" : "var(--bx-muted)",
        background: active ? color ?? "var(--bx-accent)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? "transparent" : "var(--bx-border)"}`,
      }}
    >
      {label}
    </button>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: "11px 18px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(135deg,#5b8cff,#21d4a8)",
  color: "#06121f",
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const ghostBtn: React.CSSProperties = {
  padding: "5px 11px",
  borderRadius: 8,
  border: "1px solid var(--bx-border)",
  background: "rgba(255,255,255,0.03)",
  color: "var(--bx-muted)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 8,
  border: "none",
  background: "var(--bx-accent)",
  color: "#06121f",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};
