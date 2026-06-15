"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { deriveRoutes } from "../routing";
import type { LaneId, Mission, WorkstreamAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { Desk } from "./Desk";
import { type AgentSignal, type LaneSignal, type OfficeSignals, RUN_STATUS_LABEL, runStatusColor } from "./projection";
import { FLOOR, LANE_ORDER, LANE_ZONES, MEETING_ROOM, OFFICE_VISUAL_THEMES, STATUS_COLOR, type OfficeVisualTheme, type Vec2 } from "./sceneConfig";


// Rendering reference: leooooii/Virtual-Office (Three.js office with desk
// accessories, plants, layered props and soft visual grounding). We adapt the
// rendering language procedurally with baked shadows so the RTS office stays
// lightweight and avoids WebGL context loss on constrained browsers.
const OFFICE_HTML_Z: [number, number] = [4, 0];
export type OfficeRenderMode = "balanced" | "lite";

export interface MoveTarget {
  x: number;
  z: number;
  issuedAt: number;
  source: "floor" | "zone";
}

interface Placed {
  agent: WorkstreamAgent;
  desk: [number, number, number];
  deskRot: number;
  seat: [number, number];
  rally: [number, number];
  phase: number;
}

function layoutAgents(agents: WorkstreamAgent[]): Placed[] {
  const placed: Placed[] = [];
  LANE_ORDER.forEach((laneId) => {
    const zone = LANE_ZONES[laneId];
    const list = agents.filter((a) => a.lane === laneId);
    const n = list.length;
    list.forEach((agent, i) => {
      const spanX = zone.half[0] * 1.1;
      const x = zone.center[0] + (n > 1 ? (i / (n - 1) - 0.5) * spanX : 0);
      const deskZ = zone.center[1];
      const toward = deskZ >= 0 ? -1 : 1; // direction toward plaza centre
      const seatZ = deskZ + toward * 1.2;
      placed.push({
        agent,
        desk: [x, 0, deskZ],
        deskRot: toward > 0 ? Math.PI : 0,
        seat: [x, seatZ],
        rally: [x * 0.3, deskZ * 0.22 + toward * 0.6],
        phase: (i + LANE_ORDER.indexOf(laneId)) * 1.7,
      });
    });
  });
  return placed;
}

export interface OfficeSceneProps {
  agents: WorkstreamAgent[];
  missions: Mission[];
  /** Orchestration projection (runs / threads / artifacts → desk + zone signals). */
  signals?: OfficeSignals;
  selectedId: string | null;
  moveTargets: Record<string, MoveTarget>;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  onMoveSelected: (target: MoveTarget) => void;
  onAgentPositionChange?: (agentId: string, position: Vec2) => void;
  onAgentMoveArrived?: (agentId: string, target: Vec2) => void;
  onRequestLane: (lane: LaneId) => void;
  renderMode?: OfficeRenderMode;
  visualTheme?: OfficeVisualTheme;
}

export function OfficeScene({ agents, missions, signals, selectedId, moveTargets, onSelect, onClearSelection, onMoveSelected, onAgentPositionChange, onAgentMoveArrived, onRequestLane, renderMode = "balanced", visualTheme = OFFICE_VISUAL_THEMES.comfort }: OfficeSceneProps) {
  const [hoverTarget, setHoverTarget] = useState<Vec2 | null>(null);
  const lastHoverUpdateAt = useRef(0);
  const placed = useMemo(() => layoutAgents(agents), [agents]);
  const selectedPlaced = useMemo(() => placed.find((p) => p.agent.id === selectedId) ?? null, [placed, selectedId]);
  const selectedPreviewFrom = useMemo<Vec2 | null>(() => {
    if (!selectedPlaced) return null;
    const target = moveTargets[selectedPlaced.agent.id] ?? selectedPlaced.agent.moveTarget;
    if (target && typeof target.x === "number" && typeof target.z === "number") return [target.x, target.z];
    if (selectedPlaced.agent.position && typeof selectedPlaced.agent.position.x === "number" && typeof selectedPlaced.agent.position.z === "number") return [selectedPlaced.agent.position.x, selectedPlaced.agent.position.z];
    return selectedPlaced.seat;
  }, [moveTargets, selectedPlaced]);
  const routeByAgent = useMemo(() => {
    const seats = new Map(placed.map((p) => {
      const persisted = p.agent.position;
      const physicalSeat: Vec2 = persisted && typeof persisted.x === "number" && typeof persisted.z === "number" ? [persisted.x, persisted.z] : p.seat;
      return [p.agent.id, physicalSeat] as const;
    }));
    return deriveRoutes(agents, (agentId) => seats.get(agentId) ?? [0, 0], missions);
  }, [agents, missions, placed]);

  const updateHoverTarget = (point: { x: number; z: number }) => {
    document.body.style.cursor = selectedId ? "crosshair" : "grab";
    if (!selectedId) {
      setHoverTarget(null);
      return;
    }
    const now = performance.now();
    if (now - lastHoverUpdateAt.current < 80) return;
    lastHoverUpdateAt.current = now;
    const next: Vec2 = [Math.round(point.x * 2) / 2, Math.round(point.z * 2) / 2];
    setHoverTarget((cur) => (cur && Math.hypot(cur[0] - next[0], cur[1] - next[1]) < 0.45 ? cur : next));
  };

  useEffect(() => () => { document.body.style.cursor = "default"; }, []);

  const clearMoveCommandMode = () => {
    setHoverTarget(null);
    onClearSelection();
  };

  const issueMove = (point: { x: number; z: number }, source: "floor" | "zone" = "floor") => {
    if (!selectedId) return;
    onMoveSelected({ x: point.x, z: point.z, issuedAt: Date.now(), source });
  };

  return (
    <group>
      {/* lighting: optimized baked/procedural setup, no heavy realtime environment maps. */}
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#dce8ff", "#151b2e", 0.52]} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.18}
      />

      <BakedContactShadows renderMode={renderMode} visualTheme={visualTheme} />

      {/* floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => { e.stopPropagation(); clearMoveCommandMode(); }}
        onContextMenu={(e) => { e.stopPropagation(); issueMove(e.point); }}
        onPointerMove={(e) => { e.stopPropagation(); updateHoverTarget(e.point); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = selectedId ? "crosshair" : "grab"; }}
        onPointerOut={() => { setHoverTarget(null); document.body.style.cursor = "default"; }}
      >
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial color={visualTheme.floor} roughness={0.86} metalness={0.03} />
      </mesh>
      <FloorGrid renderMode={renderMode} visualTheme={visualTheme} />

      {/* lane zones: rug + sign + key light */}
      {LANE_ORDER.map((laneId) => {
        const zone = LANE_ZONES[laneId];
        const [cx, cz] = zone.center;
        return (
          <group key={laneId}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, cz]} receiveShadow>
              <planeGeometry args={[zone.half[0] * 2, zone.half[1] * 2]} />
              <meshStandardMaterial color={zone.color} roughness={0.95} transparent opacity={visualTheme.laneOpacity} />
            </mesh>
            {/* zone outline */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.018, cz]}>
              <ringGeometry args={[zone.half[1] * 0.97, zone.half[1], 4, 1]} />
              <meshBasicMaterial color={zone.color} transparent opacity={0.0} />
            </mesh>
            {renderMode !== "lite" && <pointLight position={[cx, 4.2, cz]} intensity={0.42} color={zone.color} distance={14} />}
            {/* floating lane sign */}
            {renderMode !== "lite" && <Html position={[cx, 3.1, cz]} center distanceFactor={16} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
              <div
                style={{
                  whiteSpace: "nowrap",
                  padding: "5px 14px",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  color: "#fff",
                  background: `${zone.color}cc`,
                  border: "1px solid rgba(255,255,255,0.35)",
                  boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
                }}
              >
                {zone.glyph} {zone.label}
              </div>
            </Html>}
            <WorkRequestStation laneId={laneId} onRequestLane={onRequestLane} onMoveSelected={issueMove} selected={!!selectedId} visualTheme={visualTheme} />
            <ZoneStatus signal={signals?.byLane.get(laneId)} zone={zone} renderMode={renderMode} visualTheme={visualTheme} />
          </group>
        );
      })}

      {/* richer procedural office shell + props */}
      {renderMode !== "lite" && <OfficeProps visualTheme={visualTheme} />}
      <CeilingLights renderMode={renderMode} visualTheme={visualTheme} />

      {/* perimeter low walls */}
      <PerimeterWalls visualTheme={visualTheme} />

      {/* central plaza + BINDERY BOX signage */}
      <group>
        <MeetingRoomShell visualTheme={visualTheme} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <circleGeometry args={[3.4, 48]} />
          <meshStandardMaterial color={visualTheme.plaza} roughness={0.82} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[3.2, 3.4, 48]} />
          <meshBasicMaterial color="#5b8cff" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* sign pillar */}
        <mesh position={[0, 2.2, -0.4]} castShadow>
          <boxGeometry args={[3.6, 1.2, 0.16]} />
          <meshStandardMaterial color={visualTheme.sign} emissive={visualTheme.signEmissive} emissiveIntensity={visualTheme.id === "comfort" ? 0.12 : 0.5} roughness={0.4} />
        </mesh>
        <Html position={[0, 2.2, -0.3]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.16em", color: visualTheme.labelText, textShadow: visualTheme.id === "comfort" ? "0 2px 10px rgba(255,255,255,0.75)" : "0 2px 14px rgba(91,140,255,0.7)" }}>
              BINDERY BOX
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.42em", color: visualTheme.labelMuted, marginTop: 2 }}>
              MUFI · AI COMPANY
            </div>
          </div>
        </Html>
      </group>

      {/* desks + agents */}
      {placed.map((p) => {
        const active = p.agent.status === "running";
        const moveTarget = moveTargets[p.agent.id];
        const persisted = p.agent.position;
        const physicalHome: Vec2 = persisted && typeof persisted.x === "number" && typeof persisted.z === "number" ? [persisted.x, persisted.z] : p.seat;
        const baseRoute = routeByAgent.get(p.agent.id);
        const route = moveTarget
          ? { agentId: p.agent.id, destination: "huddle" as const, note: "이동 명령", waypoints: [physicalHome, [moveTarget.x, moveTarget.z] as Vec2], target: [moveTarget.x, moveTarget.z] as Vec2, moving: true }
          : baseRoute;
        return (
          <group key={p.agent.id}>
            <Desk
              position={p.desk}
              rotation={p.deskRot}
              screenColor={STATUS_COLOR[p.agent.status]}
              active={active}
              visualTheme={visualTheme}
            />
            <DeskSignals signal={signals?.byAgent.get(p.agent.id)} desk={p.desk} renderMode={renderMode} />
            <AgentAvatar
              agentId={p.agent.id}
              name={p.agent.name}
              role={p.agent.role}
              lane={p.agent.lane}
              status={p.agent.status}
              home={physicalHome}
              rally={p.rally}
              route={route}
              cognition={signals?.byAgent.get(p.agent.id)?.cognition}
              phase={p.phase}
              selected={selectedId === p.agent.id}
              onSelect={onSelect}
              onPositionChange={onAgentPositionChange}
              onMoveArrived={onAgentMoveArrived}
              compactLabels={renderMode === "lite"}
            />
          </group>
        );
      })}

      {selectedPreviewFrom && hoverTarget && (
        <MoveHoverPreview from={selectedPreviewFrom} target={hoverTarget} renderMode={renderMode} />
      )}

      {Object.entries(moveTargets).map(([agentId, target]) => (
        <MoveTargetMarker key={`${agentId}:${target.issuedAt}`} target={target} />
      ))}
    </group>
  );
}

function BakedContactShadows({ renderMode, visualTheme }: { renderMode: OfficeRenderMode; visualTheme: OfficeVisualTheme }) {
  return (
    <group>
      {(renderMode === "lite" ? [[0, 0, 12, 8, 0.14], [0, 0, 4, 4, 0.12]] : [[0, 0, 12, 8, 0.18], [-8, -5, 6, 3.2, 0.12], [8, 5, 6, 3.2, 0.12], [0, 0, 4, 4, 0.16]]).map(([x, z, sx, sz, opacity], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.021 + i * 0.001, z]} scale={[sx, sz, 1]}>
          <circleGeometry args={[1, renderMode === "lite" ? 24 : 48]} />
          <meshBasicMaterial color={visualTheme.shadow} transparent opacity={visualTheme.id === "comfort" ? opacity * 0.55 : opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function FloorGrid({ renderMode, visualTheme }: { renderMode: OfficeRenderMode; visualTheme: OfficeVisualTheme }) {
  const lines = [];
  const step = renderMode === "lite" ? 4 : 2;
  for (let x = -FLOOR.width / 2 + step; x < FLOOR.width / 2; x += step) {
    lines.push(<mesh key={`x-${x}`} position={[x, 0.028, 0]}><boxGeometry args={[0.018, 0.01, FLOOR.depth]} /><meshBasicMaterial color={visualTheme.floorGrid} transparent opacity={visualTheme.gridOpacity} /></mesh>);
  }
  for (let z = -FLOOR.depth / 2 + step; z < FLOOR.depth / 2; z += step) {
    lines.push(<mesh key={`z-${z}`} position={[0, 0.029, z]}><boxGeometry args={[FLOOR.width, 0.01, 0.018]} /><meshBasicMaterial color={visualTheme.floorGrid} transparent opacity={visualTheme.gridOpacity} /></mesh>);
  }
  return <group>{lines}</group>;
}

function CeilingLights({ renderMode, visualTheme }: { renderMode: OfficeRenderMode; visualTheme: OfficeVisualTheme }) {
  return (
    <group>
      {(renderMode === "lite" ? [[-8, -5], [8, 5], [0, 0]] : [[-8, -5], [8, -5], [-8, 5], [8, 5], [0, 0]]).map(([x, z], i) => (
        <group key={i} position={[x, 5.6, z]}>
          <mesh>
            <boxGeometry args={[2.8, 0.08, 0.18]} />
            <meshStandardMaterial color={visualTheme.id === "comfort" ? "#fff7e6" : "#dbe7ff"} emissive={visualTheme.id === "comfort" ? "#f4b860" : "#9fb9ff"} emissiveIntensity={visualTheme.id === "comfort" ? 0.2 : 0.55} toneMapped={false} />
          </mesh>
          {renderMode !== "lite" && <pointLight intensity={visualTheme.id === "comfort" ? 0.1 : 0.18} distance={9} color={visualTheme.id === "comfort" ? "#fff1d6" : "#dce8ff"} />}
        </group>
      ))}
    </group>
  );
}

function OfficeProps({ visualTheme }: { visualTheme: OfficeVisualTheme }) {
  return (
    <group>
      <Plant position={[-13.4, 0, -8.2]} scale={0.8} visualTheme={visualTheme} />
      <Plant position={[13.1, 0, 8.4]} scale={0.9} visualTheme={visualTheme} />
      <Plant position={[-13.5, 0, 8.3]} scale={0.7} visualTheme={visualTheme} />
      <Shelf position={[13.2, 0, -5.4]} rotation={-Math.PI / 2} visualTheme={visualTheme} />
      <Shelf position={[-4.8, 0, -10.2]} rotation={0} visualTheme={visualTheme} />
      <CoffeeTable position={[3.7, 0, 2.6]} visualTheme={visualTheme} />
    </group>
  );
}

function Plant({ position, scale = 1, visualTheme }: { position: [number, number, number]; scale?: number; visualTheme: OfficeVisualTheme }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.48, 0.64, 16]} />
        <meshStandardMaterial color={visualTheme.plantPot} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0.67, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 16]} />
        <meshStandardMaterial color="#21190f" roughness={0.85} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <group key={i} position={[0, 0.8 + i * 0.04, 0]} rotation={[0.35, a, 0.35]}>
            <mesh position={[0.28, 0.18, 0]} castShadow>
              <sphereGeometry args={[0.18, 10, 6]} />
              <meshStandardMaterial color={i % 2 ? "#1f8f58" : "#2bc274"} roughness={0.38} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Shelf({ position, rotation, visualTheme }: { position: [number, number, number]; rotation: number; visualTheme: OfficeVisualTheme }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 1.44, 0.28]} /><meshStandardMaterial color={visualTheme.shelf} roughness={0.74} /></mesh>
      {[-0.75, 0, 0.75].map((x, i) => <mesh key={i} position={[x, 1.16, 0.18]} castShadow><boxGeometry args={[0.28, 0.6, 0.12]} /><meshStandardMaterial color={["#5b8cff", "#21d4a8", "#f5a524"][i]} roughness={0.65} /></mesh>)}
      <mesh position={[0, 0.36, 0.18]} castShadow><boxGeometry args={[1.8, 0.08, 0.16]} /><meshStandardMaterial color={visualTheme.paper} roughness={0.55} /></mesh>
    </group>
  );
}

function CoffeeTable({ position, visualTheme }: { position: [number, number, number]; visualTheme: OfficeVisualTheme }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow><boxGeometry args={[1.6, 0.08, 0.85]} /><meshStandardMaterial color={visualTheme.deskTop} roughness={0.42} metalness={0.04} /></mesh>
      <mesh position={[-0.45, 0.39, 0]} castShadow><boxGeometry args={[0.45, 0.035, 0.58]} /><meshStandardMaterial color={visualTheme.paper} roughness={0.75} /></mesh>
      <mesh position={[0.45, 0.42, 0.08]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.18, 18]} /><meshStandardMaterial color={visualTheme.id === "comfort" ? "#fff7ed" : "#f5f5f5"} roughness={0.38} /></mesh>
    </group>
  );
}

function WorkRequestStation({ laneId, onRequestLane, onMoveSelected, selected, visualTheme }: { laneId: LaneId; onRequestLane: (lane: LaneId) => void; onMoveSelected: (point: { x: number; z: number }, source?: "floor" | "zone") => void; selected: boolean; visualTheme: OfficeVisualTheme }) {
  const [hovered, setHovered] = useState(false);
  const zone = LANE_ZONES[laneId];
  const x = zone.center[0];
  const z = zone.center[1] - Math.sign(zone.center[1] || 1) * (zone.half[1] - 1.1);
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.08, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onRequestLane(laneId);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          if (selected) onMoveSelected({ x, z }, "zone");
        }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "alias"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      >
        <cylinderGeometry args={[0.72, 0.72, 0.16, 32]} />
        <meshStandardMaterial color={zone.color} emissive={zone.color} emissiveIntensity={0.35} roughness={0.35} transparent opacity={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.19, 0]}>
        <ringGeometry args={[0.78, 0.95, 36]} />
        <meshBasicMaterial color="#eaf0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 1.2, 0]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div style={{ whiteSpace: "nowrap", padding: "5px 9px", borderRadius: 999, background: visualTheme.labelBg, border: `1px solid ${zone.color}66`, color: visualTheme.labelText, fontSize: 10.5, fontWeight: 800, boxShadow: visualTheme.id === "comfort" ? "0 8px 18px rgba(56,46,34,0.12)" : "0 8px 18px rgba(0,0,0,0.34)" }}>
          ＋ 업무 요청
        </div>
      </Html>
      {hovered && (
        <Html position={[0, 1.68, 0]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div className="bx-chip" style={{ whiteSpace: "nowrap", color: zone.color, background: visualTheme.labelBg, borderColor: `${zone.color}88` }}>
            좌클릭: 업무 생성{selected ? " · 우클릭: 선택 직원 이동" : ""}
          </div>
        </Html>
      )}
    </group>
  );
}

function MoveHoverPreview({ from, target, renderMode }: { from: Vec2; target: Vec2; renderMode: OfficeRenderMode }) {
  const dx = target[0] - from[0];
  const dz = target[1] - from[1];
  const length = Math.max(0.01, Math.hypot(dx, dz));
  const angle = Math.atan2(dx, dz);
  const opacity = renderMode === "lite" ? 0.46 : 0.68;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[target[0], 0.062, target[1]]}>
        <ringGeometry args={[0.34, 0.54, renderMode === "lite" ? 24 : 36]} />
        <meshBasicMaterial color="#5b8cff" transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[target[0], 0.064, target[1]]}>
        <circleGeometry args={[0.08, renderMode === "lite" ? 12 : 18]} />
        <meshBasicMaterial color="#5b8cff" transparent opacity={0.58} depthWrite={false} />
      </mesh>
      <mesh position={[from[0] + dx / 2, 0.066, from[1] + dz / 2]} rotation={[0, angle, 0]}>
        <boxGeometry args={[0.035, 0.018, length]} />
        <meshBasicMaterial color="#5b8cff" transparent opacity={renderMode === "lite" ? 0.22 : 0.34} depthWrite={false} />
      </mesh>
      {renderMode !== "lite" && (
        <Html position={[target[0], 0.72, target[1]]} center distanceFactor={15} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div className="bx-chip" style={{ color: "#b8c9ff", background: "rgba(7,12,24,0.74)", borderColor: "rgba(91,140,255,0.5)" }}>우클릭 이동</div>
        </Html>
      )}
    </group>
  );
}

function MoveTargetMarker({ target }: { target: MoveTarget }) {
  return (
    <group position={[target.x, 0.055, target.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.62, 24]} />
        <meshBasicMaterial color="#21d4a8" transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 16]} />
        <meshBasicMaterial color="#21d4a8" transparent opacity={0.88} />
      </mesh>
      <Html position={[0, 0.8, 0]} center distanceFactor={14} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div className="bx-chip" style={{ color: "#21d4a8", background: "rgba(7,12,24,0.82)" }}>이동 좌표</div>
      </Html>
    </group>
  );
}

// --- Phase 3: orchestration projection signals ------------------------------
// Desk-level signals: a run status beacon (pulsing while the run is active),
// floating artifact "file" objects, and a thread/run count chip. These read the
// renderer-agnostic projection (scene/projection.ts) so business state is never
// duplicated in the renderer — the desk only shows what the control plane reports.
function DeskSignals({ signal, desk, renderMode }: { signal?: AgentSignal; desk: [number, number, number]; renderMode: OfficeRenderMode }) {
  const beacon = useRef<THREE.Mesh>(null);
  const run = signal?.primaryRun ?? null;
  const status = String(run?.status ?? "");
  const isActive = status === "running" || status === "planned" || status === "waiting_approval";
  const runColor = runStatusColor(status);

  useFrame((state) => {
    if (!beacon.current) return;
    const t = state.clock.elapsedTime;
    const s = isActive ? 1 + Math.sin(t * 4.5) * 0.18 : 1;
    beacon.current.scale.set(s, s, s);
  });

  if (!signal || (signal.runCount === 0 && signal.artifactCount === 0 && signal.threadCount === 0)) return null;
  const [dx, , dz] = desk;

  return (
    <group position={[dx, 0, dz]}>
      {/* run status beacon above the desk */}
      {run && (
        <mesh ref={beacon} position={[0, 2.05, 0]}>
          <octahedronGeometry args={[0.16, 0]} />
          <meshStandardMaterial color={runColor} emissive={runColor} emissiveIntensity={isActive ? 0.9 : 0.45} roughness={0.3} toneMapped={false} />
        </mesh>
      )}
      {/* artifact / file objects stacked on the desk corner */}
      {signal.artifactCount > 0 && Array.from({ length: Math.min(signal.artifactCount, 3) }).map((_, i) => (
        <mesh key={i} position={[0.62, 0.82 + i * 0.06, 0.28]} castShadow rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.34, 0.045, 0.26]} />
          <meshStandardMaterial color="#eef3ff" emissive="#5b8cff" emissiveIntensity={0.16} roughness={0.55} />
        </mesh>
      ))}
      {/* combined status chip */}
      {renderMode !== "lite" && (
        <Html position={[0, 2.55, 0]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}>
            {run && (
              <span className="bx-chip" style={{ color: runColor, background: "rgba(7,12,24,0.86)", borderColor: `${runColor}66` }}>
                ▣ {RUN_STATUS_LABEL[status] ?? status}
              </span>
            )}
            {signal.threadCount > 0 && (
              <span className="bx-chip" style={{ color: "#cbd8ff", background: "rgba(7,12,24,0.86)" }}>✉ {signal.threadCount}</span>
            )}
            {signal.artifactCount > 0 && (
              <span className="bx-chip" style={{ color: "#9fe7cf", background: "rgba(7,12,24,0.86)" }}>▢ {signal.artifactCount}</span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

// Zone-level status: a coloured status ring on the lane rug + a count chip, so
// lane health (active runs / waiting approvals / artifacts) reads from across
// the board without selecting any agent.
const ZONE_STATUS_COLOR: Record<LaneSignal["status"], string> = {
  failed: "#ff5d73",
  waiting_approval: "#f5a524",
  running: "#21d4a8",
  idle: "#5b8cff",
};
const ZONE_STATUS_LABEL: Record<LaneSignal["status"], string> = {
  failed: "인시던트",
  waiting_approval: "승인 대기",
  running: "가동 중",
  idle: "대기",
};

function ZoneStatus({ signal, zone, renderMode, visualTheme }: { signal?: LaneSignal; zone: { center: [number, number]; half: [number, number] }; renderMode: OfficeRenderMode; visualTheme: OfficeVisualTheme }) {
  const ring = useRef<THREE.Mesh>(null);
  const status = signal?.status ?? "idle";
  const color = ZONE_STATUS_COLOR[status];
  const active = status === "running" || status === "waiting_approval";

  useFrame((state) => {
    if (!ring.current) return;
    const mat = ring.current.material as THREE.MeshBasicMaterial;
    mat.opacity = active ? 0.32 + Math.abs(Math.sin(state.clock.elapsedTime * 3)) * 0.4 : 0.28;
  });

  if (!signal || (signal.runCount === 0 && signal.threadCount === 0 && signal.artifactCount === 0)) return null;
  const [cx, cz] = zone.center;

  return (
    <group position={[cx, 0, cz]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[zone.half[1] * 0.82, zone.half[1] * 0.9, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {renderMode !== "lite" && (
        <Html position={[0, 0.6, zone.half[1] * 0.78]} center distanceFactor={15} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div className="bx-chip" style={{ whiteSpace: "nowrap", color, background: visualTheme.labelBg, borderColor: `${color}66` }}>
            {ZONE_STATUS_LABEL[status]} · 실행 {signal.activeRunCount}/{signal.runCount} · 산출 {signal.artifactCount}
          </div>
        </Html>
      )}
    </group>
  );
}

function MeetingRoomShell({ visualTheme }: { visualTheme: OfficeVisualTheme }) {
  const [w, d] = [MEETING_ROOM.half[0] * 2, MEETING_ROOM.half[1] * 2];
  const wallColor = visualTheme.glass;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[w, d, 0.05]} />
        <meshStandardMaterial color={visualTheme.plaza} roughness={0.8} transparent opacity={visualTheme.id === "comfort" ? 0.78 : 0.72} />
      </mesh>
      <mesh position={[0, 0.35, MEETING_ROOM.half[1]]}>
        <boxGeometry args={[w, 0.7, 0.06]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.16} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.35, -MEETING_ROOM.half[1]]}>
        <boxGeometry args={[w, 0.7, 0.06]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.16} roughness={0.25} />
      </mesh>
      <mesh position={[MEETING_ROOM.half[0], 0.35, 0]}>
        <boxGeometry args={[0.06, 0.7, d]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.16} roughness={0.25} />
      </mesh>
      <mesh position={[-MEETING_ROOM.half[0], 0.35, 0]}>
        <boxGeometry args={[0.06, 0.7, d]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.16} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.18, 1.5]} />
        <meshStandardMaterial color={visualTheme.deskTop} emissive={visualTheme.id === "comfort" ? "#f4b860" : "#263a77"} emissiveIntensity={visualTheme.id === "comfort" ? 0.06 : 0.18} roughness={0.55} />
      </mesh>
      <Html position={[0, 1.15, 2.8]} center distanceFactor={14} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div className="bx-chip" style={{ background: visualTheme.labelBg, color: visualTheme.labelText, borderColor: "rgba(168,199,255,0.32)" }}>
          승인 회의실 · Human Gate
        </div>
      </Html>
    </group>
  );
}

function PerimeterWalls({ visualTheme }: { visualTheme: OfficeVisualTheme }) {
  const hw = FLOOR.width / 2;
  const hd = FLOOR.depth / 2;
  const h = 1.1;
  const wall = (
    key: string,
    pos: [number, number, number],
    size: [number, number, number],
  ) => (
    <mesh key={key} position={pos} receiveShadow castShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={visualTheme.wall} roughness={0.9} transparent opacity={visualTheme.id === "comfort" ? 0.82 : 0.55} />
    </mesh>
  );
  return (
    <group>
      {wall("n", [0, h / 2, -hd], [FLOOR.width, h, 0.3])}
      {wall("s", [0, h / 2, hd], [FLOOR.width, h, 0.3])}
      {wall("w", [-hw, h / 2, 0], [0.3, h, FLOOR.depth])}
      {wall("e", [hw, h / 2, 0], [0.3, h, FLOOR.depth])}
    </group>
  );
}
