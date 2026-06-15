"use client";

import { MapControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { Hud } from "./hud/Hud";
import { OfficeScene, type MoveTarget } from "./scene/OfficeScene";
import { LANE_ZONES, OFFICE_VISUAL_THEMES, type OfficeVisualThemeId, type Vec2 } from "./scene/sceneConfig";
import { projectOfficeSignals } from "./scene/projection";
import type { LaneId } from "./types";
import { useOfficeData } from "./useOfficeData";

// Fixed RTS camera: the office is a board. Users select a unit/agent and click
// the floor to issue a movement intent; camera control is not the primary UX.
const RTS_CAMERA = { position: [18, 18, 18] as [number, number, number], fov: 38 };
const CAMERA_TARGET = [0, 0, 0] as [number, number, number];
const BOARD_CAMERA_POSITIONS: [number, number, number][] = [
  [18, 18, 18],
  [-18, 18, 18],
  [-18, 18, -18],
  [18, 18, -18],
];
type RenderMode = "balanced" | "lite";

function moveTargetCoordKey(target: Pick<MoveTarget, "x" | "z">) {
  return `${Math.round(target.x * 20) / 20}:${Math.round(target.z * 20) / 20}`;
}

export default function OfficeExperience() {
  const data = useOfficeData();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, MoveTarget>>({});
  const [arrivedMoveTargets, setArrivedMoveTargets] = useState<Record<string, string>>({});
  const [liveAgentPositions, setLiveAgentPositions] = useState<Record<string, Vec2>>({});
  const [composerLane, setComposerLane] = useState<LaneId | "all">("all");
  const [composerOpenNonce, setComposerOpenNonce] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>("lite");
  const lastPositionReportAt = useRef<Record<string, number>>({});
  const [visualThemeId, setVisualThemeId] = useState<OfficeVisualThemeId>("comfort");
  const [followSelected, setFollowSelected] = useState(false);
  const [webglWarning, setWebglWarning] = useState<string | null>(null);
  const [cameraViewIndex, setCameraViewIndex] = useState(0);

  const agents = useMemo(() => data.workstream?.agents ?? [], [data.workstream]);
  const missions = useMemo(() => data.workstream?.missions ?? [], [data.workstream]);
  const officeSignals = useMemo(
    () => projectOfficeSignals({ agents, threads: data.threads, runs: data.orchestratorRuns, artifacts: data.artifacts }),
    [agents, data.threads, data.orchestratorRuns, data.artifacts],
  );
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
  const visibleMoveTargets = useMemo(() => {
    const merged = { ...projectedMoveTargets, ...moveTargets };
    const out: Record<string, MoveTarget> = {};
    for (const [agentId, target] of Object.entries(merged)) {
      if (arrivedMoveTargets[agentId] === moveTargetCoordKey(target)) continue;
      out[agentId] = target;
    }
    return out;
  }, [arrivedMoveTargets, projectedMoveTargets, moveTargets]);
  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedId) ?? null, [agents, selectedId]);
  const selectedFocus = useMemo<Vec2 | null>(() => {
    if (!selectedAgent) return null;
    const live = liveAgentPositions[selectedAgent.id];
    if (live) return live;
    const target = moveTargets[selectedAgent.id] ?? selectedAgent.moveTarget;
    if (target && typeof target.x === "number" && typeof target.z === "number") return [target.x, target.z];
    if (selectedAgent.position && typeof selectedAgent.position.x === "number" && typeof selectedAgent.position.z === "number") return [selectedAgent.position.x, selectedAgent.position.z];
    return LANE_ZONES[selectedAgent.lane].center;
  }, [liveAgentPositions, moveTargets, selectedAgent]);
  const canvasDpr = renderMode === "lite" ? ([0.7, 0.9] as [number, number]) : ([0.9, 1.1] as [number, number]);
  const visualTheme = OFFICE_VISUAL_THEMES[visualThemeId];
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
    setArrivedMoveTargets((cur) => {
      if (!cur[agentId]) return cur;
      const next = { ...cur };
      delete next[agentId];
      return next;
    });
    setMoveTargets((cur) => ({ ...cur, [agentId]: target }));
    void data.moveAgent({ agentId, x: target.x, z: target.z, source: target.source });
  };

  const markMoveArrived = (agentId: string, target: Vec2) => {
    setArrivedMoveTargets((cur) => ({ ...cur, [agentId]: moveTargetCoordKey({ x: target[0], z: target[1] }) }));
    setMoveTargets((cur) => {
      const current = cur[agentId];
      if (!current || moveTargetCoordKey(current) !== moveTargetCoordKey({ x: target[0], z: target[1] })) return cur;
      const next = { ...cur };
      delete next[agentId];
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedId(null);
    setFollowSelected(false);
  };

  const rememberAgentPosition = (agentId: string, position: Vec2) => {
    const now = performance.now();
    const prevReportAt = lastPositionReportAt.current[agentId] ?? 0;
    setLiveAgentPositions((cur) => {
      const prev = cur[agentId];
      const distance = prev ? Math.hypot(prev[0] - position[0], prev[1] - position[1]) : Infinity;
      // R3F useFrame can call this at 60fps while an agent is selected. Keep
      // React state out of the hot path so camera pan/zoom/move gestures do not
      // re-render the whole scene every frame and exhaust the WebGL context.
      if (prev && (distance < 0.28 || now - prevReportAt < 180)) return cur;
      lastPositionReportAt.current[agentId] = now;
      return { ...cur, [agentId]: [Math.round(position[0] * 10) / 10, Math.round(position[1] * 10) / 10] };
    });
  };

  return (
    <div data-bx-theme={visualThemeId} onContextMenu={(e) => e.preventDefault()} style={{ position: "fixed", inset: 0, overflow: "hidden", background: "var(--bx-bg)" }}>
      <Canvas
        dpr={canvasDpr}
        camera={RTS_CAMERA}
        performance={{ min: 0.55 }}
        gl={{ antialias: false, alpha: false, stencil: false, depth: true, powerPreference: "default" }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            setRenderMode("lite");
            setWebglWarning("3D 렌더러가 리소스 압박으로 멈췄어. 저사양 모드로 전환했으니 새로고침해줘.");
          });
          canvas.addEventListener("webglcontextrestored", () => setWebglWarning(null));
        }}
        style={{ background: visualTheme.canvas }}
      >
        <color attach="background" args={[visualTheme.canvas]} />
        <fog attach="fog" args={[visualTheme.fog, 36, 74]} />
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
          onStart={() => { if (followSelected) setFollowSelected(false); }}
        />
        <CameraBoardView viewIndex={cameraViewIndex} followEnabled={followSelected} />
        <CameraFollowTarget enabled={followSelected && Boolean(selectedFocus)} target={selectedFocus} />
        <OfficeScene
          agents={agents}
          missions={missions}
          signals={officeSignals}
          selectedId={selectedId}
          moveTargets={visibleMoveTargets}
          onSelect={(id) => {
            setSelectedId((cur) => {
              if (cur === id) {
                setFollowSelected(false);
                return null;
              }
              return id;
            });
          }}
          onClearSelection={clearSelection}
          onMoveSelected={moveSelected}
          onAgentPositionChange={rememberAgentPosition}
          onAgentMoveArrived={markMoveArrived}
          onRequestLane={requestLane}
          renderMode={renderMode}
          visualTheme={visualTheme}
        />
      </Canvas>

      {webglWarning && (
        <div className="bx-panel" style={{ position: "absolute", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 60, maxWidth: 520, padding: "10px 14px", color: "#7f1d1d", background: "rgba(254,242,242,0.96)", borderColor: "rgba(239,68,68,0.35)", fontSize: 12, fontWeight: 800 }}>
          {webglWarning}
        </div>
      )}

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
        <button
          onClick={() => {
            setSelectedId(null);
            setFollowSelected(false);
          }}
          style={quickButton}
        >선택 해제</button>
        <button onClick={() => setFollowSelected((v) => !v)} disabled={!selectedAgent} style={{ ...quickButton, opacity: selectedAgent ? 1 : 0.45 }}>
          {followSelected ? "따라가기 해제" : "직원 따라가기"}
        </button>
        <button onClick={() => setCameraViewIndex((v) => (v + 1) % BOARD_CAMERA_POSITIONS.length)} style={quickButton}>
          시점 회전
        </button>
        <button onClick={() => setCameraViewIndex(0)} style={quickButton}>
          시점 리셋
        </button>
        <button onClick={() => setVisualThemeId((t) => (t === "comfort" ? "night" : "comfort"))} style={quickButton}>
          {visualThemeId === "comfort" ? "Night Ops" : "Comfort"}
        </button>
        <button onClick={() => setRenderMode((m) => (m === "lite" ? "balanced" : "lite"))} style={quickButton}>
          {renderMode === "lite" ? "고품질" : "저사양"}
        </button>
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--bx-muted)" }}>
          {selectedAgent ? `${selectedAgent.name} 선택됨 · 우클릭 이동` : "좌클릭 선택 · 좌드래그 팬 · 휠 줌 · 시점 회전"}
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

type CameraControlTarget = { target: THREE.Vector3; update: () => void };

function CameraBoardView({ viewIndex, followEnabled }: { viewIndex: number; followEnabled: boolean }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as CameraControlTarget | undefined;
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);
  const focus = useMemo(() => new THREE.Vector3(...CAMERA_TARGET), []);
  const previousViewIndex = useRef(viewIndex);
  const transitionUntil = useRef(0);

  useFrame((state) => {
    if (previousViewIndex.current !== viewIndex) {
      previousViewIndex.current = viewIndex;
      transitionUntil.current = state.clock.elapsedTime + 1.1;
    }
    if (followEnabled || state.clock.elapsedTime > transitionUntil.current) return;
    const pos = BOARD_CAMERA_POSITIONS[viewIndex % BOARD_CAMERA_POSITIONS.length] ?? BOARD_CAMERA_POSITIONS[0];
    desiredCamera.set(pos[0], pos[1], pos[2]);
    camera.position.lerp(desiredCamera, 0.09);
    if (controls) {
      controls.target.lerp(focus, 0.14);
      controls.update();
    }
  });

  return null;
}

function CameraFollowTarget({ enabled, target }: { enabled: boolean; target: Vec2 | null }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as CameraControlTarget | undefined;
  const focus = useMemo(() => new THREE.Vector3(), []);
  const desiredCamera = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!enabled || !target) return;
    focus.set(target[0], 0, target[1]);
    desiredCamera.set(target[0] + 14, 16, target[1] + 14);
    camera.position.lerp(desiredCamera, 0.075);
    if (controls) {
      controls.target.lerp(focus, 0.12);
      controls.update();
    }
  });

  return null;
}
