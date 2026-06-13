"use client";

import { useEffect, useMemo, useState } from "react";
import { LANE_ZONES } from "../scene/sceneConfig";
import type { LaneId, Mission, PlanPreview, RoleTemplate, WorkstreamAgent } from "../types";
import { levelColor } from "./ui";
import { PlanPreviewPanel } from "./PlanPreviewPanel";

function inferLaneFromIntent(text: string): LaneId | null {
  const q = text.toLowerCase();
  if (/생산|라인|납기|설비|mes|production/.test(q)) return "production";
  if (/영업|견적|고객|수주|sales|crm/.test(q)) return "sales";
  if (/scope\s*3|scope3|탄소|배출|협력사|esg/.test(q)) return "scope3";
  if (/승인|감사|권한|정책|관제|approval|audit|policy/.test(q)) return "control";
  return null;
}

export function GoalComposer({
  missions,
  agents,
  roleTemplates,
  initialLane = "all",
  openNonce = 0,
  onRun,
  onCreateTask,
  onPreviewPlan,
  onCreateAgent,
  onReseed,
  busy,
}: {
  missions: Mission[];
  agents: WorkstreamAgent[];
  roleTemplates: RoleTemplate[];
  initialLane?: LaneId | "all";
  openNonce?: number;
  onRun: (taskId: string) => void;
  onCreateTask: (input: { title: string; lane: string; priority?: string; requiresApproval?: boolean; expectedOutput?: string; enqueue?: boolean }) => Promise<void>;
  onPreviewPlan: (input: { title: string; lane: string; priority?: string; requiresApproval?: boolean; expectedOutput?: string; enqueue?: boolean }) => Promise<PlanPreview>;
  onCreateAgent: (input: { name: string; role: string; lane: string; templateId?: string; persona?: string; prompt?: string; capabilities?: string[]; kpi?: string }) => Promise<void>;
  onReseed: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [intent, setIntent] = useState("");
  const [lane, setLane] = useState<LaneId | "all">(initialLane);
  const [hireOpen, setHireOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newName, setNewName] = useState("New Operator");
  const [newRole, setNewRole] = useState("업무 자동화 담당");
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (openNonce <= 0) return;
    setOpen(true);
    setAdvanced(true);
    setLane(initialLane);
    if (initialLane !== "all") {
      const label = LANE_ZONES[initialLane].label.split(" · ")[0];
      setIntent(`${label} 구역에 업무 요청`);
    }
    setPlanPreview(null);
    setPlanError(null);
  }, [initialLane, openNonce]);

  const selectedTemplate = roleTemplates.find((t) => t.id === selectedTemplateId) ?? null;
  const inferredLane = inferLaneFromIntent(intent);
  const activeLane = (lane === "all" ? inferredLane ?? selectedTemplate?.lane ?? "control" : lane) as LaneId;
  const effectiveBusy = busy || actionBusy;
  const runnable = useMemo(() => missions.filter((m) => m.runnable), [missions]);
  const matches = useMemo(() => {
    const q = intent.trim().toLowerCase();
    let pool = lane === "all" ? missions : missions.filter((m) => m.lane === lane);
    if (q) pool = pool.filter((m) => `${m.title} ${m.laneLabel} ${m.agent}`.toLowerCase().includes(q));
    return pool;
  }, [missions, intent, lane]);

  const createZoneTask = async () => {
    const executionLane = planPreview?.lane ?? activeLane;
    const title = planPreview?.title || intent.trim() || `${LANE_ZONES[executionLane].label.split(" · ")[0]} 구역 업무 요청`;
    setActionBusy(true);
    setPlanError(null);
    try {
      await onCreateTask({
        title,
        lane: executionLane,
        priority: advanced ? "high" : "normal",
        requiresApproval: planPreview ? planPreview.approvals.some((a) => a.required) : executionLane === "sales" || executionLane === "scope3",
        expectedOutput: planPreview?.expectedArtifacts.join(" · ") || `${LANE_ZONES[executionLane].label} 업무 결과 초안`,
        enqueue: true,
      });
      setIntent("");
      setPlanPreview(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const previewCurrentPlan = async () => {
    const title = intent.trim() || `${LANE_ZONES[activeLane].label.split(" · ")[0]} 구역 업무 요청`;
    setActionBusy(true);
    setPlanError(null);
    try {
      const preview = await onPreviewPlan({
        title,
        lane: activeLane,
        priority: advanced ? "high" : "normal",
        requiresApproval: activeLane === "sales" || activeLane === "scope3",
        expectedOutput: `${LANE_ZONES[activeLane].label} 업무 결과 초안`,
        enqueue: true,
      });
      setPlanPreview(preview);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const runFirst = () => {
    if (planPreview) {
      void createZoneTask();
      return;
    }
    if (intent.trim()) {
      void previewCurrentPlan();
      return;
    }
    const target = matches.find((m) => m.runnable) ?? runnable[0];
    if (target) onRun(target.taskId);
  };

  if (!open) {
    return (
      <div style={{ pointerEvents: "auto", display: "flex", justifyContent: "center" }}>
        <button onClick={() => setOpen(true)} className="bx-panel" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 22px", cursor: "pointer", color: "var(--bx-text)", fontSize: 14, fontWeight: 700 }}>
          <span style={{ fontSize: 16, color: "var(--bx-accent)" }}>＋</span>
          목표·명령 입력
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--bx-muted)" }}>구역 업무 생성 / 직원 생성</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bx-panel" style={{ pointerEvents: "auto", width: "min(720px, 92vw)", padding: 16, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", color: "var(--bx-accent)" }}>GOAL COMPOSER</span>
        <span style={{ fontSize: 11, color: "var(--bx-muted)" }}>· 구역 업무를 만들고 담당 에이전트에게 큐잉</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setHireOpen((v) => !v)} style={ghostBtn}>직원 생성</button>
          <button onClick={() => { setAdvanced((v) => !v); setPlanPreview(null); setPlanError(null); }} style={ghostBtn}>{advanced ? "간단히" : "고급"}</button>
          <button onClick={() => setOpen(false)} style={ghostBtn}>닫기</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={intent} onChange={(e) => { setIntent(e.target.value); setPlanPreview(null); }} onKeyDown={(e) => e.key === "Enter" && runFirst()} placeholder="예: 생산 2라인 납기 위험 점검하고 조치안 만들어줘" style={{ flex: 1, background: "rgba(8,12,24,0.7)", border: "1px solid var(--bx-border)", borderRadius: 10, padding: "11px 14px", color: "var(--bx-text)", fontSize: 13, outline: "none" }} />
        <button onClick={runFirst} disabled={effectiveBusy || (!intent.trim() && matches.length === 0 && runnable.length === 0)} style={{ ...primaryBtn, opacity: effectiveBusy || (!intent.trim() && matches.length === 0 && runnable.length === 0) ? 0.5 : 1 }}>
          {effectiveBusy ? "처리 중…" : planPreview ? "계획대로 실행 ▸" : intent.trim() ? "계획 보기 ▸" : "디스패치 ▸"}
        </button>
      </div>

      {planError && (
        <div style={{ marginTop: 9, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,93,115,0.32)", background: "rgba(255,93,115,0.08)", color: "var(--bx-danger)", fontSize: 11.5 }}>
          Plan error: {planError}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Pill active={lane === "all"} onClick={() => { setLane("all"); setPlanPreview(null); setPlanError(null); }} label={`전체 (${missions.length})`} />
        {(Object.keys(LANE_ZONES) as LaneId[]).map((l) => (
          <Pill key={l} active={lane === l} onClick={() => { setLane(l); setPlanPreview(null); setPlanError(null); }} label={`${LANE_ZONES[l].glyph} ${LANE_ZONES[l].label.split(" · ")[0]}`} color={LANE_ZONES[l].color} />
        ))}
      </div>

      {planPreview && (
        <PlanPreviewPanel preview={planPreview} onExecute={() => { void createZoneTask(); }} onRevise={() => setPlanPreview(null)} busy={effectiveBusy} />
      )}

      {hireOpen && (
        <div className="bx-panel" style={{ marginTop: 10, padding: 11, borderRadius: 12, background: "rgba(255,255,255,0.025)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--bx-accent)", fontWeight: 900, letterSpacing: "0.08em" }}>CREATE AGENT</span>
            <span style={{ fontSize: 10.5, color: "var(--bx-muted)" }}>템플릿 · 프롬프트 미리보기 · 안전한 무권한 합류 · 현재 {agents.length}명</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8 }}>
            <select value={selectedTemplateId} onChange={(e) => { const t = roleTemplates.find((x) => x.id === e.target.value); setSelectedTemplateId(e.target.value); if (t) { setNewRole(t.role); setLane(t.lane); } }} style={inputMini}>
              <option value="">커스텀</option>
              {roleTemplates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름" style={inputMini} />
            <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="역할" style={inputMini} />
            <button onClick={async () => { await onCreateAgent({ name: newName, role: newRole, lane: activeLane, templateId: selectedTemplateId || undefined, capabilities: selectedTemplate?.capabilities, kpi: selectedTemplate?.kpi }); setHireOpen(false); }} disabled={busy || !newName.trim() || !newRole.trim()} style={miniBtn}>합류</button>
          </div>
          {(selectedTemplate || newRole) && (
            <div style={{ marginTop: 9, fontSize: 10.8, color: "var(--bx-muted)", lineHeight: 1.45 }}>
              <b style={{ color: "var(--bx-text)" }}>Prompt Preview:</b> {selectedTemplate?.promptPreview ?? `당신은 "${newRole}" 역할의 AI 직원입니다. 외부 영향 작업은 승인 요청 후 진행합니다.`}
            </div>
          )}
        </div>
      )}

      <div className="bx-scroll" style={{ marginTop: 12, maxHeight: 184, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.length === 0 && <div style={{ fontSize: 12, color: "var(--bx-muted)", padding: "8px 4px" }}>기존 미션 매칭 없음. 위 입력으로 새 구역 업무를 생성할 수 있습니다.</div>}
        {matches.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid var(--bx-border)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: levelColor(m.level), flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--bx-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.laneGlyph} {m.title}</div>
              <div style={{ fontSize: 10.5, color: "var(--bx-muted)", marginTop: 2 }}>{m.agent} · {m.laneLabel} · {m.status}{m.requiresApproval ? " · 승인필요" : ""}{advanced && m.priority !== "normal" ? ` · ${m.priority}` : ""}</div>
            </div>
            {m.runnable ? <button onClick={() => onRun(m.taskId)} disabled={busy} style={miniBtn}>실행</button> : <span style={{ fontSize: 10, color: "var(--bx-muted)" }}>{m.status}</span>}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10.5, color: "var(--bx-muted)" }}>구역 요청은 task.create → agent.run.queued 이벤트로 기록됩니다.</span>
        <button onClick={onReseed} style={ghostBtn}>↻ 데모 회사 재구성</button>
      </div>
    </div>
  );
}

function Pill({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return <button onClick={onClick} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", color: active ? "#fff" : "var(--bx-muted)", background: active ? color ?? "var(--bx-accent)" : "rgba(255,255,255,0.04)", border: `1px solid ${active ? "transparent" : "var(--bx-border)"}` }}>{label}</button>;
}

const inputMini: React.CSSProperties = { background: "rgba(8,12,24,0.7)", border: "1px solid var(--bx-border)", borderRadius: 9, padding: "8px 10px", color: "var(--bx-text)", fontSize: 12, outline: "none" };
const primaryBtn: React.CSSProperties = { padding: "11px 18px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#5b8cff,#21d4a8)", color: "#06121f", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const ghostBtn: React.CSSProperties = { padding: "5px 11px", borderRadius: 8, border: "1px solid var(--bx-border)", background: "rgba(255,255,255,0.03)", color: "var(--bx-muted)", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const miniBtn: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: "none", background: "var(--bx-accent)", color: "#06121f", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };
