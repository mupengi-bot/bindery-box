"use client";

import { MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState, type CSSProperties } from "react";
import { Hud } from "./hud/Hud";
import { OfficeScene, type MoveTarget } from "./scene/OfficeScene";
import type { LaneId } from "./types";
import { useOfficeData } from "./useOfficeData";

// Fixed RTS camera: the office is a board. Users select a unit/agent and click
// the floor to issue a movement intent; camera control is not the primary UX.
const RTS_CAMERA = { position: [18, 18, 18] as [number, number, number], fov: 38 };
const CAMERA_TARGET = [0, 0, 0] as [number, number, number];
type RenderMode = "balanced" | "lite";

export default function OfficeExperience() {
  const data = useOfficeData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, MoveTarget>>({});
  const [composerLane, setComposerLane] = useState<LaneId | "all">("all");
  const [composerOpenNonce, setComposerOpenNonce] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>("balanced");

  const agents = useMemo(() => data.workstream?.agents ?? [], [data.workstream]);
  const missions = useMemo(() => data.workstream?.missions ?? [], [data.workstream]);
  const projectedMoveTargets = useMemo(() => {
    const out: Record<string, MoveTarget> = {};
    for (const a of agents) {
      if (a.moveTarget && typeof a.moveTarget.x === "number" && typeof a.moveTarget.z === "number") {
        out[a.id] = {
          x: a.moveTarget.x,
          z: a.moveTarget.z,
          source: a.moveTarget.source === "zone" ? "zone" : "floor",
          issuedAt: typeof a.moveTarget.issuedAt === "number" ? a.moveTarget.issuedAt : Date.parse(String(a.moveTarget.issuedAt ?? Date.now())),
        };
      }
    }
    return out;
  }, [agents]);
  const visibleMoveTargets = useMemo(() => ({ ...projectedMoveTargets, ...moveTargets }), [projectedMoveTargets, moveTargets]);
  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedId) ?? null, [agents, selectedId]);
  const canvasDpr = renderMode === "lite" ? ([0.8, 1] as [number, number]) : ([1, 1.25] as [number, number]);
  const selectFirstRunnableAgent = () => {
    const runnable = missions.find((m) => m.runnable && m.agentId);
    const fallback = agents[0];
    setSelectedId(runnable?.agentId ?? fallback?.id ?? null);
  };

  const requestLane = (lane: LaneId) => {
    setComposerLane(lane);
    setComposerOpenNonce((n) => n + 1);
  };

  const moveSelected = (target: MoveTarget) => {
    if (!selectedId) return;
    const agentId = selectedId;
    setMoveTargets((cur) => ({ ...cur, [agentId]: target }));
    void data.moveAgent({ agentId, x: target.x, z: target.z, source: target.source });
  };

  return (
    <div onContextMenu={(e) => e.preventDefault()} style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Canvas
        dpr={canvasDpr}
        camera={RTS_CAMERA}
        performance={{ min: 0.55 }}
        gl={{ antialias: renderMode !== "lite", alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
        style={{ background: "#070b16" }}
      >
        <color attach="background" args={["#070b16"]} />
        <fog attach="fog" args={["#070b16", 36, 74]} />
        <MapControls
          makeDefault
          target={CAMERA_TARGET}
          enableRotate={false}
          enablePan
          enableZoom
          zoomSpeed={0.85}
          panSpeed={0.75}
          minDistance={10}
          maxDistance={38}
          dampingFactor={0.08}
        />
        <OfficeScene
          agents={agents}
          missions={missions}
          selectedId={selectedId}
          moveTargets={visibleMoveTargets}
          onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          onMoveSelected={moveSelected}
          onRequestLane={requestLane}
          renderMode={renderMode}
        />
      </Canvas>

      <div
        className="bx-panel"
        style={{
          position: "absolute",
          left: 14,
          top: 14,
          zIndex: 42,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 9px",
          color: "var(--bx-text)",
          fontSize: 11,
        }}
      >
        <button onClick={selectFirstRunnableAgent} style={quickButton}>빠른 선택</button>
        <button onClick={() => setSelectedId(null)} style={quickButton}>선택 해제</button>
        <button onClick={() => setRenderMode((m) => (m === "lite" ? "balanced" : "lite"))} style={quickButton}>
          {renderMode === "lite" ? "고품질" : "저사양"}
        </button>
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--bx-muted)" }}>
          {selectedAgent ? `${selectedAgent.name} 선택됨 · 우클릭 이동` : "클릭 선택 · 우클릭 이동"}
        </span>
      </div>

      <Hud
        data={data}
        selectedId={selectedId}
        onSelect={setSelectedId}
        composerLane={composerLane}
        composerOpenNonce={composerOpenNonce}
      />
    </div>
  );
}

const quickButton: CSSProperties = { padding: "5px 8px", borderRadius: 8, border: "1px solid var(--bx-border)", background: "rgba(255,255,255,0.04)", color: "var(--bx-text)", fontSize: 11, fontWeight: 800, cursor: "pointer" };
