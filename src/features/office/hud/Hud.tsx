"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OfficeData } from "../useOfficeData";
import type { LaneId, Mission, Workstream } from "../types";
import { AgentPanel } from "./AgentPanel";
import { FirstRunOverlay } from "./FirstRunOverlay";
import { GoalComposer } from "./GoalComposer";
import { LiveProcess } from "./LiveProcess";
import { PerformanceBoard } from "./PerformanceBoard";
import { Sheets, SHEET_TABS, type SheetId } from "./Sheets";
import { Ticker } from "./Ticker";

const HUD_Z = { root: 20, top: 30, side: 34, dock: 36, composer: 40, toast: 50, sheet: 70, firstRun: 90 };
const FIRST_RUN_KEY = "bindery-box:first-run-dismissed";

export function Hud({
  data,
  selectedId,
  onSelect,
  composerLane = "all",
  composerOpenNonce = 0,
}: {
  data: OfficeData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  composerLane?: LaneId | "all";
  composerOpenNonce?: number;
}) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const [busy, setBusy] = useState(false);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const ws = data.workstream;

  useEffect(() => {
    setFirstRunOpen(globalThis.localStorage?.getItem(FIRST_RUN_KEY) !== "1");
  }, []);

  const dismissFirstRun = useCallback(() => {
    globalThis.localStorage?.setItem(FIRST_RUN_KEY, "1");
    setFirstRunOpen(false);
  }, []);

  const resetGuide = useCallback(() => {
    globalThis.localStorage?.removeItem(FIRST_RUN_KEY);
    setFirstRunOpen(true);
  }, []);

  const nextAction = useMemo(() => pickNextAction(ws), [ws]);

  const withBusy = useCallback(
    (fn: () => Promise<void>) => async () => {
      setBusy(true);
      try {
        await fn();
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const runMission = useCallback((taskId: string) => withBusy(() => data.runMission(taskId))(), [data, withBusy]);
  const decide = useCallback(
    (id: string, d: "approved" | "rejected") => withBusy(() => data.decideApproval(id, d))(),
    [data, withBusy],
  );
  const reseed = useCallback(() => withBusy(() => data.reseed())(), [data, withBusy]);

  const selectedAgent = ws?.agents.find((a) => a.id === selectedId);
  const selectedPerf = ws?.agentPerformance.find((p) => p.id === selectedId);
  const pendingApprovals = (ws?.alerts ?? []).filter((a) => a.kind === "approval").length;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: HUD_Z.root,
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gridTemplateColumns: "minmax(260px, 360px) minmax(320px, 1fr) minmax(280px, 380px)",
        gridTemplateAreas: `"top top top" "left stage right" "dock composer toast"`,
        gap: 12,
        padding: "0 12px 18px",
        boxSizing: "border-box",
      }}
    >
      {/* top stack: brand bar + market ticker */}
      <div style={{ gridArea: "top", zIndex: HUD_Z.top, margin: "0 -12px" }}>
        <BrandBar data={data} onReseed={reseed} onResetGuide={resetGuide} busy={busy} />
        {ws && <Ticker indices={ws.market.indices} performers={ws.agentPerformance} />}
      </div>

      {/* left: agent detail when selected */}
      <div style={{ gridArea: "left", alignSelf: "start", paddingTop: 4, zIndex: HUD_Z.side }}>
        {selectedAgent ? (
          <AgentPanel
            agent={selectedAgent}
            perf={selectedPerf}
            missions={ws?.missions ?? []}
            onRun={runMission}
            onClose={() => onSelect(null)}
            busy={busy}
          />
        ) : (
          <NextActionCard action={nextAction} onRun={runMission} onOpenMissions={() => setSheet("missions")} busy={busy} />
        )}
      </div>

      {/* right: live ops log */}
      <div style={{ gridArea: "right", alignSelf: "start", justifySelf: "end", paddingTop: 4, zIndex: HUD_Z.side }}>
        <LiveProcess log={data.liveLog} />
        <PerformanceBoard workstream={ws} />
      </div>

      {/* bottom-left: sheet dock */}
      <div style={{ gridArea: "dock", alignSelf: "end", justifySelf: "start", display: "flex", flexDirection: "column", gap: 8, pointerEvents: "auto", zIndex: HUD_Z.dock }}>
        {SHEET_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSheet((cur) => (cur === t.id ? null : t.id))}
            className="bx-panel"
            title={t.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 13px",
              cursor: "pointer",
              color: sheet === t.id ? "var(--bx-accent)" : "var(--bx-text)",
              fontSize: 12,
              fontWeight: 700,
              border: sheet === t.id ? "1px solid var(--bx-accent)" : "1px solid var(--bx-border)",
            }}
          >
            <span style={{ fontSize: 14 }}>{t.glyph}</span>
            {t.label}
            {t.id === "approvals" && pendingApprovals > 0 && (
              <span style={{ background: "#f5a524", color: "#06121f", borderRadius: 999, fontSize: 10, fontWeight: 900, padding: "1px 6px" }}>
                {pendingApprovals}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* bottom-center: goal composer */}
      <div style={{ gridArea: "composer", alignSelf: "end", justifySelf: "center", width: "100%", zIndex: HUD_Z.composer }}>
        <GoalComposer missions={ws?.missions ?? []} agents={ws?.agents ?? []} roleTemplates={data.roleTemplates} initialLane={composerLane} openNonce={composerOpenNonce} onRun={runMission} onCreateTask={data.createTask} onPreviewPlan={data.previewPlan} onCreateAgent={data.createAgent} onReseed={reseed} busy={busy} />
      </div>

      {/* error toast */}
      {data.error && (
        <div style={{ gridArea: "toast", alignSelf: "end", justifySelf: "end", pointerEvents: "auto", zIndex: HUD_Z.toast }} className="bx-panel">
          <div style={{ padding: "10px 14px", fontSize: 11.5, color: "#ff5d73" }}>API: {data.error}</div>
        </div>
      )}

      {/* secondary sheets */}
      <div style={{ position: "absolute", inset: 0, zIndex: HUD_Z.sheet, pointerEvents: "none" }}>
        <Sheets
          sheet={sheet}
          onClose={() => setSheet(null)}
          workstream={ws}
          connectors={data.connectors}
          goldenImage={data.goldenImage}
          onRun={runMission}
          onDecide={decide}
          searchKnowledge={data.searchKnowledge}
          busy={busy}
        />
      </div>

      {firstRunOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: HUD_Z.firstRun }}>
          <FirstRunOverlay workstream={ws} onSkip={dismissFirstRun} onRun={runMission} />
        </div>
      )}
    </div>
  );
}

function BrandBar({ data, onReseed, onResetGuide, busy }: { data: OfficeData; onReseed: () => void; onResetGuide: () => void; busy: boolean }) {
  const c = data.workstream?.company;
  const status = data.workstream?.market.status;
  return (
    <div
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 18px",
        background: "rgba(8,12,24,0.82)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--bx-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: "0.12em", color: "#eaf0ff" }}>BINDERY BOX</span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.28em", color: "var(--bx-muted)" }}>MUFI BOX</span>
      </div>

      {c && (
        <>
          <Divider />
          <Stat label="회사" value={c.name} />
          <Stat label="등급" value={c.tier} />
          <Stat label="헬스" value={`${c.healthScore}`} accent={c.healthScore >= 60 ? "#21d4a8" : "#f5a524"} />
          <Stat label="자동화" value={`${c.automationLevel}%`} />
          <Stat label="가동 에이전트" value={`${c.activeAgents}`} />
        </>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {status && (
          <span className="bx-chip" style={{ color: "#eaf0ff" }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "#21d4a8", animation: "bx-pulse 1.6s infinite" }} />
            {status.label}
          </span>
        )}
        <button onClick={onResetGuide} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--bx-border)", background: "rgba(91,140,255,0.08)", color: "var(--bx-text)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          Guide
        </button>
        <button onClick={onReseed} disabled={busy} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--bx-border)", background: "rgba(255,255,255,0.04)", color: "var(--bx-muted)", fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
          ↻ Reseed
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
      <span style={{ fontSize: 9, color: "var(--bx-muted)", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: accent ?? "var(--bx-text)" }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <span style={{ width: 1, height: 22, background: "var(--bx-border)" }} />;
}

interface NextAction {
  eyebrow: string;
  title: string;
  detail: string;
  mission: Mission | null;
  tone: "approval" | "run" | "inspect";
}

function pickNextAction(workstream: Workstream | null): NextAction {
  if (!workstream) {
    return {
      eyebrow: "LOADING",
      title: "오피스 상태를 불러오는 중",
      detail: "3D 오피스, 업무 큐, 에이전트 실적을 연결하고 있습니다.",
      mission: null,
      tone: "inspect",
    };
  }

  const approval = workstream.missions.find((m) => m.requiresApproval || m.status === "waiting_approval") ?? null;
  if (approval) {
    return {
      eyebrow: "HUMAN GATE",
      title: "승인 필요한 업무가 있습니다",
      detail: `${approval.agent} · ${approval.title}`,
      mission: approval,
      tone: "approval",
    };
  }

  const runnable = workstream.missions.find((m) => m.runnable) ?? null;
  if (runnable) {
    return {
      eyebrow: "NEXT BEST ACTION",
      title: "바로 실행할 수 있는 미션",
      detail: `${runnable.laneGlyph} ${runnable.title} · ${runnable.agent}`,
      mission: runnable,
      tone: "run",
    };
  }

  return {
    eyebrow: "COMMAND HINT",
    title: "직원을 선택하고 좌표를 찍어 지휘하세요",
    detail: "좌클릭/우클릭 이동, 스크롤 줌, 구역별 ＋ 업무 요청을 사용할 수 있습니다.",
    mission: null,
    tone: "inspect",
  };
}

function NextActionCard({ action, onRun, onOpenMissions, busy }: { action: NextAction; onRun: (taskId: string) => void; onOpenMissions: () => void; busy: boolean }) {
  const accent = action.tone === "approval" ? "var(--bx-warn)" : action.tone === "run" ? "var(--bx-accent-2)" : "var(--bx-accent)";
  return (
    <div className="bx-panel" style={{ pointerEvents: "auto", width: 324, padding: 16 }}>
      <div style={{ fontSize: 10.5, color: accent, fontWeight: 900, letterSpacing: "0.13em" }}>{action.eyebrow}</div>
      <div style={{ marginTop: 9, fontSize: 20, lineHeight: 1.08, fontWeight: 950, letterSpacing: "-0.03em", color: "var(--bx-text)" }}>{action.title}</div>
      <div style={{ marginTop: 9, fontSize: 12, lineHeight: 1.5, color: "var(--bx-muted)" }}>{action.detail}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        {action.mission ? (
          <button onClick={() => onRun(action.mission?.taskId ?? "")} disabled={busy} style={{ ...nextButton, background: "linear-gradient(135deg,#5b8cff,#21d4a8)", color: "#06121f", opacity: busy ? 0.5 : 1 }}>
            실행 ▸
          </button>
        ) : (
          <button onClick={onOpenMissions} style={{ ...nextButton, background: "rgba(91,140,255,0.14)", color: "var(--bx-text)" }}>
            미션 보기
          </button>
        )}
        <button onClick={onOpenMissions} style={{ ...nextButton, background: "rgba(255,255,255,0.045)", color: "var(--bx-muted)", border: "1px solid var(--bx-border)" }}>
          Control
        </button>
      </div>

      <div style={{ marginTop: 13, padding: 10, borderRadius: 12, background: "rgba(8,12,24,0.62)", border: "1px solid rgba(120,150,220,0.12)", color: "var(--bx-muted)", fontSize: 11.2, lineHeight: 1.45 }}>
        <b style={{ color: "var(--bx-text)" }}>조작:</b> 직원 클릭 → 바닥 좌클릭/우클릭 이동 · 휠 줌 · 업무는 구역 스테이션에서 생성
      </div>
    </div>
  );
}

const nextButton: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};
