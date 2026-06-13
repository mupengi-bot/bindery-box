"use client";

import { useState } from "react";
import type { LiveLog } from "../types";
import { fmtTime, levelColor } from "./ui";

const SOURCE_LABEL: Record<string, string> = {
  runtime: "RT",
  agent: "AG",
  audit: "AU",
  office: "OF",
};

// Live process overlay — the real-time operations log streamed from the
// control plane (runtime events + agent runs + audit + office channel posts),
// the same /live-log surface the original platform exposed.
export function LiveProcess({ log }: { log: LiveLog | null }) {
  const [open, setOpen] = useState(true);
  const entries = log?.entries ?? [];

  return (
    <div
      className="bx-panel"
      style={{
        pointerEvents: "auto",
        width: 340,
        display: "flex",
        flexDirection: "column",
        maxHeight: open ? "min(56vh, 460px)" : 46,
        overflow: "hidden",
        transition: "max-height 0.25s ease",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--bx-text)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: "#21d4a8", animation: "bx-pulse 1.6s infinite" }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" }}>LIVE OPS LOG</span>
        <span style={{ fontSize: 10.5, color: "var(--bx-muted)" }}>{entries.length} events</span>
        <span style={{ marginLeft: "auto", color: "var(--bx-muted)", fontSize: 12 }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="bx-scroll" style={{ overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {entries.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--bx-muted)", padding: 8 }}>아직 활동이 없습니다.</div>
          )}
          {entries.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 8, padding: "6px 8px", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 800,
                  color: levelColor(e.level),
                  border: `1px solid ${levelColor(e.level)}55`,
                  borderRadius: 5,
                  padding: "1px 4px",
                  height: 16,
                  lineHeight: "14px",
                }}
              >
                {SOURCE_LABEL[e.source] ?? "··"}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11.5, color: "var(--bx-text)", lineHeight: 1.35 }}>{e.message}</div>
                <div style={{ fontSize: 9.5, color: "var(--bx-muted)", marginTop: 2 }}>
                  {fmtTime(e.ts)} · {e.actor}
                  {e.channel ? ` · ${e.channel}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
