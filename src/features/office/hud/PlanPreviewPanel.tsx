"use client";

import type { PlanPreview } from "../types";

const RISK_COLOR: Record<string, string> = {
  low: "var(--bx-accent-2)",
  medium: "var(--bx-warn)",
  high: "var(--bx-danger)",
};

export function PlanPreviewPanel({ preview, onExecute, onRevise, busy }: { preview: PlanPreview; onExecute: () => void; onRevise: () => void; busy: boolean }) {
  const approvalNeeded = preview.approvals.some((a) => a.required);
  return (
    <div className="bx-panel" style={{ marginTop: 12, padding: 13, borderRadius: 14, background: "rgba(255,255,255,0.028)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--bx-accent-2)", fontWeight: 900, letterSpacing: "0.12em" }}>PLAN PREVIEW</div>
          <div style={{ marginTop: 5, fontSize: 15, fontWeight: 900, color: "var(--bx-text)" }}>{preview.title}</div>
          <div style={{ marginTop: 4, fontSize: 11.2, color: "var(--bx-muted)" }}>
            담당: {preview.assignedAgentName} · 예상 {preview.estimatedMinutes}분 · 신뢰도 {preview.confidence}%
          </div>
        </div>
        <span className="bx-chip" style={{ color: approvalNeeded ? "var(--bx-warn)" : "var(--bx-accent-2)" }}>
          {approvalNeeded ? "승인 경계 있음" : "읽기 중심"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12, marginTop: 12 }}>
        <div>
          <div style={sectionTitle}>작업 단계</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {preview.steps.map((step) => (
              <div key={step.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, alignItems: "center", padding: "7px 8px", borderRadius: 10, background: "rgba(8,12,24,0.58)", border: "1px solid rgba(120,150,220,0.12)" }}>
                <span style={{ width: 20, height: 20, display: "grid", placeItems: "center", borderRadius: 8, background: "rgba(91,140,255,0.13)", color: "var(--bx-accent)", fontSize: 10.5, fontWeight: 900 }}>{step.index}</span>
                <span style={{ fontSize: 11.5, color: "var(--bx-text)", lineHeight: 1.35 }}>{step.label}</span>
                <span style={{ fontSize: 9.5, fontWeight: 900, color: RISK_COLOR[step.risk] ?? "var(--bx-muted)" }}>{step.risk}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <PlanList title="필요 데이터" items={preview.requiredData} />
          <PlanList title="예상 산출물" items={preview.expectedArtifacts} />
          <div>
            <div style={sectionTitle}>승인 경계</div>
            {preview.approvals.map((a) => (
              <div key={a.boundary} style={{ fontSize: 10.8, color: "var(--bx-muted)", lineHeight: 1.45 }}>
                <b style={{ color: a.required ? "var(--bx-warn)" : "var(--bx-accent-2)" }}>{a.required ? "필요" : "불필요"}</b> · {a.reason}<br />
                <span>{a.boundary}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button onClick={onRevise} style={secondaryButton}>수정</button>
        <button disabled={busy} onClick={onExecute} style={{ ...primaryButton, opacity: busy ? 0.5 : 1 }}>{busy ? "생성 중…" : "계획대로 실행 ▸"}</button>
      </div>
    </div>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {items.map((item) => <span key={item} className="bx-chip" style={{ color: "var(--bx-muted)", fontSize: 10 }}>{item}</span>)}
      </div>
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 10.5, color: "var(--bx-muted)", fontWeight: 900, letterSpacing: "0.08em", marginBottom: 6 };
const primaryButton: React.CSSProperties = { padding: "9px 13px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#5b8cff,#21d4a8)", color: "#06121f", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { padding: "9px 13px", borderRadius: 10, border: "1px solid var(--bx-border)", background: "rgba(255,255,255,0.04)", color: "var(--bx-muted)", fontSize: 12, fontWeight: 800, cursor: "pointer" };
