"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import { Hud } from "./hud/Hud";
import { OfficeScene } from "./scene/OfficeScene";
import { useOfficeData } from "./useOfficeData";

export default function OfficeExperience() {
  const data = useOfficeData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const agents = useMemo(() => data.workstream?.agents ?? [], [data.workstream]);

  return (
    <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [17, 15, 21], fov: 42 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#070b16"]} />
        <fog attach="fog" args={["#070b16", 34, 70]} />
        <OfficeScene
          agents={agents}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
        />
        <OrbitControls
          makeDefault
          target={[0, 1.2, 0]}
          enablePan
          minDistance={9}
          maxDistance={46}
          minPolarAngle={0.18}
          maxPolarAngle={1.45}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>

      <Hud data={data} selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
