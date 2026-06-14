"use client";

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { deriveRoutes } from "../routing";
import type { LaneId, Mission, WorkstreamAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { Desk } from "./Desk";
import { FLOOR, LANE_ORDER, LANE_ZONES, MEETING_ROOM, STATUS_COLOR, type Vec2 } from "./sceneConfig";


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
  selectedId: string | null;
  moveTargets: Record<string, MoveTarget>;
  onSelect: (id: string) => void;
  onMoveSelected: (target: MoveTarget) => void;
  onRequestLane: (lane: LaneId) => void;
  renderMode?: OfficeRenderMode;
}

export function OfficeScene({ agents, missions, selectedId, moveTargets, onSelect, onMoveSelected, onRequestLane, renderMode = "balanced" }: OfficeSceneProps) {
  const placed = useMemo(() => layoutAgents(agents), [agents]);
  const routeByAgent = useMemo(() => {
    const seats = new Map(placed.map((p) => [p.agent.id, p.seat]));
    return deriveRoutes(agents, (agentId) => seats.get(agentId) ?? [0, 0], missions);
  }, [agents, missions, placed]);

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

      <BakedContactShadows renderMode={renderMode} />

      {/* floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={(e) => { e.stopPropagation(); issueMove(e.point); }}
        onContextMenu={(e) => { e.stopPropagation(); issueMove(e.point); }}
      >
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial color="#0d1425" roughness={0.88} metalness={0.08} />
      </mesh>
      <FloorGrid renderMode={renderMode} />

      {/* lane zones: rug + sign + key light */}
      {LANE_ORDER.map((laneId) => {
        const zone = LANE_ZONES[laneId];
        const [cx, cz] = zone.center;
        return (
          <group key={laneId}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.012, cz]} receiveShadow>
              <planeGeometry args={[zone.half[0] * 2, zone.half[1] * 2]} />
              <meshStandardMaterial color={zone.color} roughness={0.95} transparent opacity={0.32} />
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
            <WorkRequestStation laneId={laneId} onRequestLane={onRequestLane} onMoveSelected={issueMove} selected={!!selectedId} />
          </group>
        );
      })}

      {/* richer procedural office shell + props */}
      {renderMode !== "lite" && <OfficeProps />}
      <CeilingLights renderMode={renderMode} />

      {/* perimeter low walls */}
      <PerimeterWalls />

      {/* central plaza + BINDERY BOX signage */}
      <group>
        <MeetingRoomShell />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <circleGeometry args={[3.4, 48]} />
          <meshStandardMaterial color="#161d33" roughness={0.85} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[3.2, 3.4, 48]} />
          <meshBasicMaterial color="#5b8cff" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
        {/* sign pillar */}
        <mesh position={[0, 2.2, -0.4]} castShadow>
          <boxGeometry args={[3.6, 1.2, 0.16]} />
          <meshStandardMaterial color="#0c1226" emissive="#1b2750" emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
        <Html position={[0, 2.2, -0.3]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.16em", color: "#eaf0ff", textShadow: "0 2px 14px rgba(91,140,255,0.7)" }}>
              BINDERY BOX
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.42em", color: "#7d93d6", marginTop: 2 }}>
              MUFI · AI COMPANY
            </div>
          </div>
        </Html>
      </group>

      {/* desks + agents */}
      {placed.map((p) => {
        const active = p.agent.status === "running";
        const moveTarget = moveTargets[p.agent.id];
        const baseRoute = routeByAgent.get(p.agent.id);
        const route = moveTarget
          ? { agentId: p.agent.id, destination: "huddle" as const, note: "이동 명령", waypoints: [p.seat as Vec2, [moveTarget.x, moveTarget.z] as Vec2], target: [moveTarget.x, moveTarget.z] as Vec2, moving: true }
          : baseRoute;
        return (
          <group key={p.agent.id}>
            <Desk
              position={p.desk}
              rotation={p.deskRot}
              screenColor={STATUS_COLOR[p.agent.status]}
              active={active}
            />
            <AgentAvatar
              agentId={p.agent.id}
              name={p.agent.name}
              role={p.agent.role}
              status={p.agent.status}
              home={p.seat}
              rally={p.rally}
              route={route}
              phase={p.phase}
              selected={selectedId === p.agent.id}
              onSelect={onSelect}
              compactLabels={renderMode === "lite"}
            />
          </group>
        );
      })}

      {Object.entries(moveTargets).map(([agentId, target]) => (
        <MoveTargetMarker key={`${agentId}:${target.issuedAt}`} target={target} />
      ))}
    </group>
  );
}

function BakedContactShadows({ renderMode }: { renderMode: OfficeRenderMode }) {
  return (
    <group>
      {(renderMode === "lite" ? [[0, 0, 12, 8, 0.14], [0, 0, 4, 4, 0.12]] : [[0, 0, 12, 8, 0.18], [-8, -5, 6, 3.2, 0.12], [8, 5, 6, 3.2, 0.12], [0, 0, 4, 4, 0.16]]).map(([x, z, sx, sz, opacity], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.021 + i * 0.001, z]} scale={[sx, sz, 1]}>
          <circleGeometry args={[1, renderMode === "lite" ? 24 : 48]} />
          <meshBasicMaterial color="#020611" transparent opacity={opacity} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function FloorGrid({ renderMode }: { renderMode: OfficeRenderMode }) {
  const lines = [];
  const step = renderMode === "lite" ? 4 : 2;
  for (let x = -FLOOR.width / 2 + step; x < FLOOR.width / 2; x += step) {
    lines.push(<mesh key={`x-${x}`} position={[x, 0.028, 0]}><boxGeometry args={[0.018, 0.01, FLOOR.depth]} /><meshBasicMaterial color="#26304e" transparent opacity={0.28} /></mesh>);
  }
  for (let z = -FLOOR.depth / 2 + step; z < FLOOR.depth / 2; z += step) {
    lines.push(<mesh key={`z-${z}`} position={[0, 0.029, z]}><boxGeometry args={[FLOOR.width, 0.01, 0.018]} /><meshBasicMaterial color="#26304e" transparent opacity={0.28} /></mesh>);
  }
  return <group>{lines}</group>;
}

function CeilingLights({ renderMode }: { renderMode: OfficeRenderMode }) {
  return (
    <group>
      {(renderMode === "lite" ? [[-8, -5], [8, 5], [0, 0]] : [[-8, -5], [8, -5], [-8, 5], [8, 5], [0, 0]]).map(([x, z], i) => (
        <group key={i} position={[x, 5.6, z]}>
          <mesh>
            <boxGeometry args={[2.8, 0.08, 0.18]} />
            <meshStandardMaterial color="#dbe7ff" emissive="#9fb9ff" emissiveIntensity={0.55} toneMapped={false} />
          </mesh>
          {renderMode !== "lite" && <pointLight intensity={0.18} distance={9} color="#dce8ff" />}
        </group>
      ))}
    </group>
  );
}

function OfficeProps() {
  return (
    <group>
      <Plant position={[-13.4, 0, -8.2]} scale={0.8} />
      <Plant position={[13.1, 0, 8.4]} scale={0.9} />
      <Plant position={[-13.5, 0, 8.3]} scale={0.7} />
      <Shelf position={[13.2, 0, -5.4]} rotation={-Math.PI / 2} />
      <Shelf position={[-4.8, 0, -10.2]} rotation={0} />
      <CoffeeTable position={[3.7, 0, 2.6]} />
    </group>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.48, 0.64, 16]} />
        <meshStandardMaterial color="#f4efe5" roughness={0.42} />
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

function Shelf({ position, rotation }: { position: [number, number, number]; rotation: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 1.44, 0.28]} /><meshStandardMaterial color="#19223b" roughness={0.74} /></mesh>
      {[-0.75, 0, 0.75].map((x, i) => <mesh key={i} position={[x, 1.16, 0.18]} castShadow><boxGeometry args={[0.28, 0.6, 0.12]} /><meshStandardMaterial color={["#5b8cff", "#21d4a8", "#f5a524"][i]} roughness={0.65} /></mesh>)}
      <mesh position={[0, 0.36, 0.18]} castShadow><boxGeometry args={[1.8, 0.08, 0.16]} /><meshStandardMaterial color="#dce8ff" roughness={0.55} /></mesh>
    </group>
  );
}

function CoffeeTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.32, 0]} castShadow receiveShadow><boxGeometry args={[1.6, 0.08, 0.85]} /><meshStandardMaterial color="#26314f" roughness={0.42} metalness={0.12} /></mesh>
      <mesh position={[-0.45, 0.39, 0]} castShadow><boxGeometry args={[0.45, 0.035, 0.58]} /><meshStandardMaterial color="#eaf0ff" roughness={0.75} /></mesh>
      <mesh position={[0.45, 0.42, 0.08]} castShadow><cylinderGeometry args={[0.13, 0.13, 0.18, 18]} /><meshStandardMaterial color="#f5f5f5" roughness={0.38} /></mesh>
    </group>
  );
}

function WorkRequestStation({ laneId, onRequestLane, onMoveSelected, selected }: { laneId: LaneId; onRequestLane: (lane: LaneId) => void; onMoveSelected: (point: { x: number; z: number }, source?: "floor" | "zone") => void; selected: boolean }) {
  const zone = LANE_ZONES[laneId];
  const x = zone.center[0];
  const z = zone.center[1] - Math.sign(zone.center[1] || 1) * (zone.half[1] - 1.1);
  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.08, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (selected) onMoveSelected({ x, z }, "zone");
          onRequestLane(laneId);
        }}
        onContextMenu={(e) => {
          e.stopPropagation();
          if (selected) onMoveSelected({ x, z }, "zone");
          onRequestLane(laneId);
        }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <cylinderGeometry args={[0.72, 0.72, 0.16, 32]} />
        <meshStandardMaterial color={zone.color} emissive={zone.color} emissiveIntensity={0.35} roughness={0.35} transparent opacity={0.88} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.19, 0]}>
        <ringGeometry args={[0.78, 0.95, 36]} />
        <meshBasicMaterial color="#eaf0ff" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[0, 1.2, 0]} center distanceFactor={13} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div style={{ whiteSpace: "nowrap", padding: "5px 9px", borderRadius: 999, background: "rgba(9,14,29,0.84)", border: `1px solid ${zone.color}99`, color: "#eaf0ff", fontSize: 10.5, fontWeight: 800, boxShadow: "0 8px 18px rgba(0,0,0,0.34)" }}>
          ＋ 업무 요청
        </div>
      </Html>
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

function MeetingRoomShell() {
  const [w, d] = [MEETING_ROOM.half[0] * 2, MEETING_ROOM.half[1] * 2];
  const wallColor = "#a8c7ff";
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[w, d, 0.05]} />
        <meshStandardMaterial color="#111936" roughness={0.8} transparent opacity={0.72} />
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
        <meshStandardMaterial color="#18223e" emissive="#263a77" emissiveIntensity={0.18} roughness={0.55} />
      </mesh>
      <Html position={[0, 1.15, 2.8]} center distanceFactor={14} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div className="bx-chip" style={{ background: "rgba(9,14,29,0.86)", color: "#dbe7ff", borderColor: "rgba(168,199,255,0.32)" }}>
          승인 회의실 · Human Gate
        </div>
      </Html>
    </group>
  );
}

function PerimeterWalls() {
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
      <meshStandardMaterial color="#2a3252" roughness={0.9} transparent opacity={0.55} />
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
