"use client";

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { deriveRoutes } from "../routing";
import type { LaneId, Mission, WorkstreamAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { Desk } from "./Desk";
import { FLOOR, LANE_ORDER, LANE_ZONES, MEETING_ROOM, STATUS_COLOR, type Vec2 } from "./sceneConfig";


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
}

export function OfficeScene({ agents, missions, selectedId, moveTargets, onSelect, onMoveSelected, onRequestLane }: OfficeSceneProps) {
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
      {/* lighting */}
      <ambientLight intensity={0.62} />
      <hemisphereLight args={["#cfe0ff", "#1a1f30", 0.5]} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.05}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
      />

      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={(e) => { e.stopPropagation(); issueMove(e.point); }}>
        <planeGeometry args={[FLOOR.width, FLOOR.depth]} />
        <meshStandardMaterial color="#0e1424" roughness={0.96} metalness={0.04} />
      </mesh>

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
            <pointLight position={[cx, 4.2, cz]} intensity={0.34} color={zone.color} distance={14} />
            {/* floating lane sign */}
            <Html position={[cx, 3.1, cz]} center distanceFactor={16} pointerEvents="none">
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
            </Html>
            <WorkRequestStation laneId={laneId} onRequestLane={onRequestLane} onMoveSelected={issueMove} selected={!!selectedId} />
          </group>
        );
      })}

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
        <Html position={[0, 2.2, -0.3]} center distanceFactor={13} pointerEvents="none">
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
      <Html position={[0, 1.2, 0]} center distanceFactor={13} pointerEvents="none">
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
        <ringGeometry args={[0.42, 0.62, 36]} />
        <meshBasicMaterial color="#21d4a8" transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.1, 24]} />
        <meshBasicMaterial color="#21d4a8" transparent opacity={0.88} />
      </mesh>
      <Html position={[0, 0.8, 0]} center distanceFactor={14} pointerEvents="none">
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
      <Html position={[0, 1.15, 2.8]} center distanceFactor={14} pointerEvents="none">
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
