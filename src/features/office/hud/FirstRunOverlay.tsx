"use client";

import type { Mission, Workstream } from "../types";
import { trendColor } from "./ui";

const OBJECTIVES = [
  {
    id: "engineering",
    glyph: "⌘",
    title: "GitHub PR/이슈 triage",
    detail: "이슈, PR, CI 상태를 읽고 다음 액션과 승인 경계를 만듭니다.",
    lane: "engineering",
  },
  {
    id: "legal",
    glyph: "§",
    title: "계약·정책 검토",
    detail: "문서 위험 조항과 수정 제안, 외부 발송 전 승인 메모를 만듭니다.",
    lane: "legal",
  },
  {
    id: "operations",
    glyph: "◆",
    title: "Mattermost 운영 요청",
    detail: "채팅 스레드를 업무화하고 런북 기준 다음 조치를 정리합니다.",
    lane: "operations",
  },
];

export function FirstRunOverlay({ workstream, onSkip, onRun }: { workstream: Workstream | null; onSkip: () => void; onRun: (taskId: string) => void }) {
  const company = workstream?.company;
  const best = workstream?.agentPerformance?.[0];

  const chooseObjective = (lane: string) => {
    const mission = workstream?.missions.find((m) => m.lane === lane && m.runnable) ?? workstream?.missions.find((m) => m.runnable);
    onSkip();
    if (mission) onRun(mission.taskId);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "radial-gradient(circle at 50% 38%, rgba(255,255,255,0.58), rgba(245,242,234,0.76) 45%, rgba(235,230,220,0.9))",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="bx-panel"
        style={{
          width: "min(940px, 94vw)",
          padding: 24,
          borderRadius: 26,
          background: "linear-gradient(145deg, rgba(255,252,245,0.94), rgba(248,246,240,0.88))",
          boxShadow: "0 34px 120px rgba(56,46,34,0.18), inset 0 1px 0 rgba(255,255,255,0.85)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 22, alignItems: "stretch" }}>
          <div>
            <div className="bx-chip" style={{ color: "var(--bx-accent-2)", marginBottom: 16 }}>
              ◉ AI COMPANY OFFICE · FIRST RUN
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(32px, 5vw, 62px)", lineHeight: 0.96, letterSpacing: "-0.055em", color: "var(--bx-text)" }}>
              회사 안에 작은 AI 운영팀을 설치합니다.
            </h1>
            <p style={{ margin: "18px 0 0", maxWidth: 640, color: "var(--bx-muted)", fontSize: 15.5, lineHeight: 1.65 }}>
              목표를 고르면 3D 오피스의 직원들이 업무 큐와 로그, 승인 흐름으로 연결됩니다. 이동은 RTS처럼 직접 명령할 때만 발생하고, 실제 업무 상태는 HUD와 스트림에서 추적됩니다.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 22 }}>
              {OBJECTIVES.map((o) => (
                <button
                  key={o.id}
                  onClick={() => chooseObjective(o.lane)}
                  style={{
                    textAlign: "left",
                    minHeight: 148,
                    border: "1px solid var(--bx-border)",
                    borderRadius: 18,
                    padding: 15,
                    cursor: "pointer",
                    color: "var(--bx-text)",
                    background: "linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,250,240,0.52))",
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(91,140,255,0.16)", color: "var(--bx-accent)", fontSize: 20, marginBottom: 14 }}>{o.glyph}</div>
                  <div style={{ fontSize: 14, fontWeight: 900 }}>{o.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--bx-muted)", lineHeight: 1.45, marginTop: 7 }}>{o.detail}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--bx-accent-2)", marginTop: 13 }}>Run objective ▸</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="bx-panel" style={{ padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.035)" }}>
              <div style={{ fontSize: 10.5, color: "var(--bx-muted)", fontWeight: 800, letterSpacing: "0.12em" }}>WORKSPACE SNAPSHOT</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <Snapshot label="회사" value={company?.name ?? "BINDERY"} />
                <Snapshot label="헬스" value={`${company?.healthScore ?? "--"}`} accent="var(--bx-accent-2)" />
                <Snapshot label="자동화" value={`${company?.automationLevel ?? "--"}%`} />
                <Snapshot label="승인 대기" value={`${company?.pendingApprovals ?? 0}`} accent={(company?.pendingApprovals ?? 0) > 0 ? "var(--bx-warn)" : undefined} />
              </div>
            </div>

            {best && (
              <div className="bx-panel" style={{ padding: 16, borderRadius: 18, background: "rgba(255,255,255,0.035)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: "var(--bx-muted)", fontWeight: 800, letterSpacing: "0.12em" }}>TOP AGENT</div>
                    <div style={{ marginTop: 8, fontSize: 19, fontWeight: 900 }}>{best.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--bx-muted)", marginTop: 3 }}>{best.role}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 32, fontWeight: 950, color: "var(--bx-text)", lineHeight: 0.95 }}>{best.score}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: trendColor(best.trend), marginTop: 6 }}>{best.deltaPercent > 0 ? "+" : ""}{best.deltaPercent}%</div>
                  </div>
                </div>
                <div style={{ marginTop: 14, fontSize: 12, color: "var(--bx-muted)", lineHeight: 1.5 }}>{best.summary}</div>
              </div>
            )}

            <div style={{ marginTop: "auto", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onSkip} style={secondaryButton}>Skip to cockpit</button>
              <button onClick={() => chooseObjective("engineering")} style={primaryButton}>Start real-work loop ▸</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Snapshot({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 14, background: "rgba(255,255,255,0.62)", border: "1px solid var(--bx-border)" }}>
      <div style={{ fontSize: 10, color: "var(--bx-muted)", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 900, color: accent ?? "var(--bx-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg,#5b8cff,#21d4a8)",
  color: "#06121f",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  padding: "11px 16px",
  borderRadius: 12,
  border: "1px solid var(--bx-border)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--bx-muted)",
  fontWeight: 800,
  cursor: "pointer",
};
