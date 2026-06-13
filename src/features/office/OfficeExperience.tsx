"use client";

import { MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { Hud } from "./hud/Hud";
import { OfficeScene, type MoveTarget } from "./scene/OfficeScene";
import type { LaneId } from "./types";
import { useOfficeData } from "./useOfficeData";

// Fixed RTS camera: the office is a board. Users select a unit/agent and click
// the floor to issue a movement intent; camera control is not the primary UX.
const RTS_CAMERA = { position: [18, 18, 18] as [number, number, number], fov: 38 };
const CAMERA_TARGET = [0, 0, 0] as [number, number, number];

export default function OfficeExperience() {
  const data = useOfficeData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, MoveTarget>>({});
  const [composerLane, setComposerLane] = useState<LaneId | "all">("all");
  const [composerOpenNonce, setComposerOpenNonce] = useState(0);

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
        dpr={[1, 1.25]}
        camera={RTS_CAMERA}
        performance={{ min: 0.55 }}
        gl={{ antialias: true, alpha: false, stencil: false, depth: true, powerPreference: "high-performance" }}
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
        />
      </Canvas>

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
