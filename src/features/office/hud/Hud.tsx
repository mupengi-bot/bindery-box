"use client";

import { useCallback, useState } from "react";
import type { OfficeData } from "../useOfficeData";
import { AgentPanel } from "./AgentPanel";
import { GoalComposer } from "./GoalComposer";
import { LiveProcess } from "./LiveProcess";
import { Sheets, SHEET_TABS, type SheetId } from "./Sheets";
import { Ticker } from "./Ticker";

export function Hud({
  data,
  selectedId,
  onSelect,
}: {
  data: OfficeData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const [busy, setBusy] = useState(false);
  const ws = data.workstream;

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
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10 }}>
      {/* top stack: brand bar + market ticker */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <BrandBar data={data} onReseed={reseed} busy={busy} />
        {ws && <Ticker indices={ws.market.indices} performers={ws.agentPerformance} />}
      </div>

      {/* left: agent detail when selected */}
      {selectedAgent && (
        <div style={{ position: "absolute", top: 118, left: 12 }}>
          <AgentPanel
            agent={selectedAgent}
            perf={selectedPerf}
            missions={ws?.missions ?? []}
            onRun={runMission}
            onClose={() => onSelect(null)}
            busy={busy}
          />
        </div>
      )}

      {/* right: live ops log */}
      <div style={{ position: "absolute", top: 118, right: 12 }}>
        <LiveProcess log={data.liveLog} />
      </div>

      {/* bottom-left: sheet dock */}
      <div style={{ position: "absolute", bottom: 18, left: 12, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "auto" }}>
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
      <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, padding: "0 200px" }}>
        <GoalComposer missions={ws?.missions ?? []} onRun={runMission} onReseed={reseed} busy={busy} />
      </div>

      {/* error toast */}
      {data.error && (
        <div style={{ position: "absolute", bottom: 18, right: 12, pointerEvents: "auto" }} className="bx-panel">
          <div style={{ padding: "10px 14px", fontSize: 11.5, color: "#ff5d73" }}>API: {data.error}</div>
        </div>
      )}

      {/* secondary sheets */}
      <Sheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        workstream={ws}
        connectors={data.connectors}
        onRun={runMission}
        onDecide={decide}
        searchKnowledge={data.searchKnowledge}
        busy={busy}
      />
    </div>
  );
}

function BrandBar({ data, onReseed, busy }: { data: OfficeData; onReseed: () => void; busy: boolean }) {
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
