"use client";

import { useState } from "react";
import type { Connector, GoldenImage, GoldenPlane, KnowledgeResult, Workstream } from "../types";
import { Bar, levelColor } from "./ui";

export type SheetId = "missions" | "golden" | "connectors" | "knowledge" | "approvals" | null;

export const SHEET_TABS: { id: Exclude<SheetId, null>; label: string; glyph: string }[] = [
  { id: "missions", label: "미션 보드", glyph: "▤" },
  { id: "golden", label: "골든 이미지", glyph: "◉" },
  { id: "connectors", label: "커넥터 허브", glyph: "⧉" },
  { id: "knowledge", label: "지식 그래프", glyph: "❖" },
  { id: "approvals", label: "승인 대기", glyph: "✓" },
];

// Secondary 2D surfaces, presented as a slide-over sheet on top of the 3D
// office: the mission board, connector hub, knowledge-graph search and the
// approval queue — the Mission-Control dashboards from the original platform.
export function Sheets({
  sheet,
  onClose,
  workstream,
  connectors,
  goldenImage,
  onRun,
  onDecide,
  searchKnowledge,
  busy,
}: {
  sheet: SheetId;
  onClose: () => void;
  workstream: Workstream | null;
  connectors: Connector[];
  goldenImage: GoldenImage | null;
  onRun: (taskId: string) => void;
  onDecide: (approvalId: string, decision: "approved" | "rejected") => void;
  searchKnowledge: (q: string) => Promise<KnowledgeResult[]>;
  busy: boolean;
}) {
  if (!sheet) return null;
  const tab = SHEET_TABS.find((t) => t.id === sheet);

  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(4,7,15,0.45)", pointerEvents: "auto" }} />
      <div
        className="bx-panel bx-scroll"
        style={{
          pointerEvents: "auto",
          position: "absolute",
          top: 12,
          right: 12,
          bottom: 12,
          width: "min(440px, 94vw)",
          borderRadius: 18,
          padding: 18,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 16 }}>{tab?.glyph}</span>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{tab?.label}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--bx-muted)", cursor: "pointer", fontSize: 18 }}>
            ✕
          </button>
        </div>

        {sheet === "missions" && <MissionsView workstream={workstream} onRun={onRun} busy={busy} />}
        {sheet === "golden" && <GoldenImageView goldenImage={goldenImage} />}
        {sheet === "connectors" && <ConnectorsView connectors={connectors} />}
        {sheet === "knowledge" && <KnowledgeView searchKnowledge={searchKnowledge} />}
        {sheet === "approvals" && <ApprovalsView workstream={workstream} onDecide={onDecide} busy={busy} />}
      </div>
    </>
  );
}

function MissionsView({ workstream, onRun, busy }: { workstream: Workstream | null; onRun: (id: string) => void; busy: boolean }) {
  const missions = workstream?.missions ?? [];
  const stages = workstream?.pipeline.stages ?? [];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {stages.map((s) => (
          <div key={s.id} className="bx-panel" style={{ flex: 1, padding: "8px 6px", textAlign: "center", borderRadius: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{s.count}</div>
            <div style={{ fontSize: 9.5, color: "var(--bx-muted)" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {missions.map((m) => (
          <div key={m.id} className="bx-panel" style={{ padding: 12, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: levelColor(m.level) }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{m.laneGlyph} {m.title}</span>
              {m.runnable && (
                <button onClick={() => onRun(m.taskId)} disabled={busy} style={runMini}>
                  실행
                </button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--bx-muted)", margin: "6px 0 8px" }}>
              {m.agent} · {m.laneLabel} · {m.status}{m.requiresApproval ? " · 승인필요" : ""}
            </div>
            <Bar value={m.progress} color={levelColor(m.level)} />
            {m.summary && <div style={{ fontSize: 11, color: "var(--bx-muted)", marginTop: 8, lineHeight: 1.4 }}>{m.summary}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function GoldenImageView({ goldenImage }: { goldenImage: GoldenImage | null }) {
  if (!goldenImage) return <Empty>골든 이미지 매니페스트를 불러오는 중…</Empty>;
  const live = goldenImage.status;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="bx-panel" style={{ padding: 14, borderRadius: 14, borderColor: "rgba(91,140,255,0.42)" }}>
        <div style={{ fontSize: 12, color: "var(--bx-muted)", marginBottom: 4 }}>Core Identity · Golden Image</div>
        <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.18 }}>{goldenImage.identity.tagline}</div>
        <div style={{ fontSize: 11.5, color: "var(--bx-muted)", marginTop: 8, lineHeight: 1.55 }}>{goldenImage.identity.northStar}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          <span className="bx-chip" style={{ color: "#eaf0ff" }}>surface: {goldenImage.identity.surface}</span>
          {live && <span className="bx-chip" style={{ color: "#21d4a8" }}>{live.planesLive}/{live.planesTotal} planes live</span>}
          {live && <span className="bx-chip" style={{ color: "#f5a524" }}>{live.invariants} invariants</span>}
        </div>
      </div>

      <div>
        <SectionTitle>Planes behind the Claw3D office</SectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          {goldenImage.planes.map((p) => <PlaneCard key={p.id} plane={p} />)}
        </div>
      </div>

      <div>
        <SectionTitle>Progressive UX layers</SectionTitle>
        <div style={{ display: "grid", gap: 8 }}>
          {goldenImage.uxLayers.map((l) => (
            <div key={l.id} className="bx-panel" style={{ padding: 11, borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{l.name}</span>
                <span className="bx-chip" style={{ color: layerColor(l.id) }}>{l.tier}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--bx-muted)", marginTop: 5, lineHeight: 1.45 }}>{l.description}</div>
              <div style={{ fontSize: 10.5, color: "#8ea2d2", marginTop: 5 }}>disclosure: {l.disclosure}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Non-negotiable invariants</SectionTitle>
        <div style={{ display: "grid", gap: 7 }}>
          {goldenImage.invariants.map((i) => (
            <div key={i.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, fontSize: 11.2, lineHeight: 1.42 }}>
              <span style={{ color: "#21d4a8", fontWeight: 900 }}>✓</span>
              <span><b style={{ color: "var(--bx-text)" }}>{i.statement}</b><br /><span style={{ color: "var(--bx-muted)" }}>{i.rationale}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="bx-panel" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: "var(--bx-muted)", marginBottom: 4 }}>Runtime invariant</div>
        <code style={{ fontSize: 11, lineHeight: 1.45, color: "#cbd8ff" }}>{goldenImage.lifecycle}</code>
      </div>
    </div>
  );
}

function PlaneCard({ plane }: { plane: GoldenPlane }) {
  const state = plane.runtime?.state ?? plane.maturity;
  return (
    <div className="bx-panel" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: stateColor(state), boxShadow: `0 0 14px ${stateColor(state)}88` }} />
        <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{plane.name}</span>
        <span className="bx-chip" style={{ color: stateColor(state) }}>{state}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--bx-muted)", marginTop: 6, lineHeight: 1.45 }}>{plane.role}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
        {plane.owns.slice(0, 3).map((o) => <span key={o} className="bx-chip" style={{ color: "#9fb0d8" }}>{o}</span>)}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--bx-muted)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", margin: "2px 0 8px" }}>{children}</div>;
}

function stateColor(state: string) {
  if (state === "running") return "#21d4a8";
  if (state === "queued") return "#f5a524";
  if (state === "planned") return "#8ea2d2";
  return "#5b8cff";
}

function layerColor(id: string) {
  if (id === "frontstage") return "#21d4a8";
  if (id === "messenger") return "#f5a524";
  return "#5b8cff";
}

function ConnectorsView({ connectors }: { connectors: Connector[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {connectors.length === 0 && <Empty>커넥터 정보를 불러오는 중…</Empty>}
      {connectors.map((c) => (
        <div key={c.id} className="bx-panel" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{c.name ?? c.id}</span>
            {c.category && <span className="bx-chip" style={{ color: "var(--bx-muted)" }}>{c.category}</span>}
            {c.status && (
              <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700, color: c.status === "connected" ? "#21d4a8" : "var(--bx-muted)" }}>
                {c.status}
              </span>
            )}
          </div>
          {c.description && <div style={{ fontSize: 11, color: "var(--bx-muted)", marginTop: 6 }}>{c.description}</div>}
          {Array.isArray(c.capabilities) && c.capabilities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {c.capabilities.map((cap) => (
                <span key={cap} className="bx-chip" style={{ color: "var(--bx-muted)" }}>{cap}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function KnowledgeView({ searchKnowledge }: { searchKnowledge: (q: string) => Promise<KnowledgeResult[]> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    try {
      setResults(await searchKnowledge(q));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="지식 그래프 검색 (예: 납기, 탄소, 고객)"
          style={{ flex: 1, background: "rgba(8,12,24,0.7)", border: "1px solid var(--bx-border)", borderRadius: 10, padding: "10px 12px", color: "var(--bx-text)", fontSize: 12.5, outline: "none" }}
        />
        <button onClick={run} style={runMini}>검색</button>
      </div>
      {loading && <Empty>검색 중…</Empty>}
      {!loading && results.length === 0 && <Empty>검색어를 입력하세요.</Empty>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {results.map((r, i) => (
          <div key={r.id ?? i} className="bx-panel" style={{ padding: 12, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{r.label ?? r.title ?? r.id}</span>
              {r.type && <span className="bx-chip" style={{ color: "var(--bx-muted)" }}>{r.type}</span>}
              {typeof r.score === "number" && <span style={{ fontSize: 10.5, color: "var(--bx-accent)", fontWeight: 700 }}>{r.score.toFixed(2)}</span>}
            </div>
            {r.snippet && <div style={{ fontSize: 11, color: "var(--bx-muted)", marginTop: 6, lineHeight: 1.4 }}>{r.snippet}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ApprovalsView({ workstream, onDecide, busy }: { workstream: Workstream | null; onDecide: (id: string, d: "approved" | "rejected") => void; busy: boolean }) {
  const pending = (workstream?.alerts ?? []).filter((a) => a.kind === "approval" && a.approvalId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pending.length === 0 && <Empty>승인 대기 중인 작업이 없습니다.</Empty>}
      {pending.map((a) => (
        <div key={a.id} className="bx-panel" style={{ padding: 12, borderRadius: 12, borderColor: "rgba(245,165,36,0.4)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#f5a524" }}>{a.title}</div>
          <div style={{ fontSize: 11, color: "var(--bx-muted)", margin: "6px 0 10px", lineHeight: 1.4 }}>{a.message}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onDecide(a.approvalId!, "approved")} disabled={busy} style={{ ...runMini, flex: 1, background: "#21d4a8" }}>
              승인
            </button>
            <button onClick={() => onDecide(a.approvalId!, "rejected")} disabled={busy} style={{ ...runMini, flex: 1, background: "transparent", color: "#ff5d73", border: "1px solid #ff5d7355" }}>
              반려
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: "var(--bx-muted)", padding: "10px 4px" }}>{children}</div>;
}

const runMini: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--bx-accent)",
  color: "#06121f",
  fontSize: 11.5,
  fontWeight: 800,
  cursor: "pointer",
};
