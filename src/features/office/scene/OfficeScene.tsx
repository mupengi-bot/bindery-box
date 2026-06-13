"use client";

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { WorkstreamAgent } from "../types";
import { AgentAvatar } from "./AgentAvatar";
import { Desk } from "./Desk";
import { FLOOR, LANE_ORDER, LANE_ZONES, STATUS_COLOR } from "./sceneConfig";

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
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function OfficeScene({ agents, selectedId, onSelect }: OfficeSceneProps) {
  const placed = useMemo(() => layoutAgents(agents), [agents]);

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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
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
          </group>
        );
      })}

      {/* perimeter low walls */}
      <PerimeterWalls />

      {/* central plaza + BINDERY BOX signage */}
      <group>
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
              phase={p.phase}
              selected={selectedId === p.agent.id}
              onSelect={onSelect}
            />
          </group>
        );
      })}
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
