"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { Hud } from "./hud/Hud";
import { OfficeScene, type MoveTarget } from "./scene/OfficeScene";
import type { LaneId } from "./types";
import { useOfficeData } from "./useOfficeData";

// Fixed RTS camera: the office is a board. Users select a unit/agent and click
// the floor to issue a movement intent; camera control is not the primary UX.
const RTS_CAMERA = { position: [18, 18, 18] as [number, number, number], fov: 38 };

export default function OfficeExperience() {
  const data = useOfficeData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, MoveTarget>>({});
  const [composerLane, setComposerLane] = useState<LaneId | "all">("all");
  const [composerOpenNonce, setComposerOpenNonce] = useState(0);

  const agents = useMemo(() => data.workstream?.agents ?? [], [data.workstream]);
  const missions = useMemo(() => data.workstream?.missions ?? [], [data.workstream]);

  const requestLane = (lane: LaneId) => {
    setComposerLane(lane);
    setComposerOpenNonce((n) => n + 1);
  };

  const moveSelected = (target: MoveTarget) => {
    if (!selectedId) return;
    setMoveTargets((cur) => ({ ...cur, [selectedId]: target }));
  };

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={RTS_CAMERA}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#070b16"]} />
        <fog attach="fog" args={["#070b16", 36, 74]} />
        <OfficeScene
          agents={agents}
          missions={missions}
          selectedId={selectedId}
          moveTargets={moveTargets}
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
