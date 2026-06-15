"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AgentRoute } from "../routing";
import { type AgentCognition } from "./projection";
import type { AgentStatus, LaneId } from "../types";
import { STATUS_COLOR, STATUS_RING } from "./sceneConfig";

export interface AgentAvatarProps {
  agentId: string;
  name: string;
  role: string;
  lane: LaneId;
  status: AgentStatus;
  /** Desk seat position [x, z]. */
  home: [number, number];
  /** Rally point [x, z] running agents walk toward. */
  rally: [number, number];
  /** Renderer-agnostic route derived from the workstream projection. */
  route?: AgentRoute;
  cognition?: AgentCognition;
  /** Deterministic phase offset so avatars don't move in lockstep. */
  phase: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onPositionChange?: (agentId: string, position: [number, number]) => void;
  onMoveArrived?: (agentId: string, target: [number, number]) => void;
  compactLabels?: boolean;
}

const ARRIVAL_EPSILON = 0.045;
const WALK_SPEED = 4.2;
const OFFICE_HTML_Z: [number, number] = [4, 0];
const PENGUIN_BODY = "#101827";
const PENGUIN_BELLY = "#fff7ed";
const PENGUIN_BEAK = "#f59e0b";
const PENGUIN_FOOT = "#f97316";
const HAT_COLORS = ["#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706", "#0891b2", "#be185d", "#4f46e5"] as const;

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
}

function hatColorForAgent(agentId: string, lane: LaneId) {
  const laneOffset: Record<LaneId, number> = { engineering: 0, legal: 1, operations: 2, control: 3 };
  return HAT_COLORS[(hashString(agentId) + laneOffset[lane]) % HAT_COLORS.length];
}

// A lightweight procedural penguin employee: oval body, white belly, orange
// beak/feet, flipper arms, per-agent colored hat, a status halo and a floating
// nameplate. Kept primitive-only so the 3D office remains fast and deployable
// without external GLTF assets.
export function AgentAvatar({
  agentId,
  name,
  role,
  lane,
  status,
  home,
  rally,
  route,
  cognition,
  phase,
  selected,
  onSelect,
  onPositionChange,
  onMoveArrived,
  compactLabels = false,
}: AgentAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const arrivalPulse = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.MeshBasicMaterial>(null);
  const arrivalStartedAt = useRef(-10);
  const wasTravelling = useRef(false);

  const prev = useRef(new THREE.Vector3(home[0], 0, home[1]));
  const target = useMemo(() => new THREE.Vector3(), []);
  const [arrived, setArrived] = useState(false);

  const homeVec = useMemo(() => new THREE.Vector3(home[0], 0, home[1]), [home]);
  const rallyVec = useMemo(() => new THREE.Vector3(rally[0], 0, rally[1]), [rally]);
  const routePoints = route?.waypoints;
  const routeKey = routePoints && routePoints.length > 0 ? routePoints.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join("|") : `${home[0].toFixed(2)},${home[1].toFixed(2)}:${status}`;

  useEffect(() => {
    setArrived(false);
  }, [routeKey]);

  const color = STATUS_COLOR[status];
  const ringColor = STATUS_RING[status];
  const hatColor = useMemo(() => hatColorForAgent(agentId, lane), [agentId, lane]);
  const moving = Boolean(route?.moving);
  const working = arrived && Boolean(route?.moving);
  const firstName = useMemo(() => name.split(" ")[0] ?? name, [name]);
  const showNameplate = !compactLabels || selected || status === "running" || Boolean(route?.note);
  const showCognition = Boolean(cognition) && (!compactLabels || selected || cognition?.state !== "idle");

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime + phase;

    // --- locomotion target ---
    // RTS movement is one-shot: move toward the current command target, clamp on
    // arrival, then stay there in a working state. Do not ping-pong back to the
    // seat; the office projection is the source of truth for future moves.
    if (routePoints && routePoints.length > 0) {
      const last = routePoints[routePoints.length - 1];
      target.set(last[0], 0, last[1]);
    } else if (moving) {
      target.copy(rallyVec);
    } else {
      target.copy(homeVec);
    }

    const distance = g.position.distanceTo(target);
    if (distance <= ARRIVAL_EPSILON) {
      g.position.copy(target);
      if (route?.moving && wasTravelling.current && !arrived) {
        setArrived(true);
        arrivalStartedAt.current = state.clock.elapsedTime;
        wasTravelling.current = false;
        onMoveArrived?.(agentId, [target.x, target.z]);
      }
    } else {
      if (route?.moving) wasTravelling.current = true;
      const step = Math.min(1, (WALK_SPEED * delta) / distance);
      g.position.lerp(target, step);
    }

    // --- facing: turn toward travel direction, else toward plaza centre ---
    const vx = g.position.x - prev.current.x;
    const vz = g.position.z - prev.current.z;
    const speed = Math.hypot(vx, vz);
    const targetYaw = speed > 0.0015 ? Math.atan2(vx, vz) : Math.atan2(-g.position.x, -g.position.z);
    let dy = targetYaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * 0.12;
    prev.current.copy(g.position);

    // --- limb animation ---
    const walkPhase = speed > 0.0015 ? Math.sin(time * 7) : 0;
    const breathe = Math.sin(time * 1.6) * 0.04;
    if (leftLeg.current) leftLeg.current.rotation.x = walkPhase * 0.7;
    if (rightLeg.current) rightLeg.current.rotation.x = -walkPhase * 0.7;
    if (leftArm.current) leftArm.current.rotation.x = -walkPhase * 0.6 + breathe;
    if (rightArm.current) rightArm.current.rotation.x = walkPhase * 0.6 - breathe;
    g.position.y = speed > 0.0015 ? Math.abs(walkPhase) * 0.06 : breathe * 0.5;

    // --- status halo pulse ---
    if (ring.current) {
      const s = 1 + (moving && !working ? Math.sin(time * 4) * 0.12 : working ? Math.sin(time * 5.5) * 0.08 : Math.sin(time * 2) * 0.04);
      ring.current.scale.set(s, s, s);
    }
    if (dot.current) {
      dot.current.opacity = 0.55 + Math.abs(Math.sin(time * 3)) * 0.45;
    }
    if (arrivalPulse.current) {
      const age = state.clock.elapsedTime - arrivalStartedAt.current;
      const mat = arrivalPulse.current.material as THREE.MeshBasicMaterial;
      if (age >= 0 && age < 1.2) {
        const k = age / 1.2;
        arrivalPulse.current.scale.setScalar(1 + k * 1.6);
        mat.opacity = (1 - k) * 0.72;
      } else {
        mat.opacity = 0;
      }
    }
    if (selected) onPositionChange?.(agentId, [g.position.x, g.position.z]);
  });

  useEffect(() => () => { document.body.style.cursor = "default"; }, []);

  return (
    <group
      ref={group}
      position={[home[0], 0, home[1]]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(agentId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default";
      }}
    >
      {/* ground halo */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.42, 0.56, compactLabels ? 24 : 40]} />
        <meshBasicMaterial color={ringColor} transparent opacity={selected ? 0.95 : 0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={arrivalPulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.033, 0]}>
        <ringGeometry args={[0.48, 0.66, compactLabels ? 24 : 40]} />
        <meshBasicMaterial color="#eaf0ff" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* penguin feet */}
      <group ref={leftLeg} position={[-0.16, 0.18, 0.1]}>
        <mesh castShadow rotation={[0.12, 0.18, 0]} scale={[1.35, 0.32, 0.82]}>
          <sphereGeometry args={[0.16, compactLabels ? 10 : 14, compactLabels ? 8 : 10]} />
          <meshStandardMaterial color={PENGUIN_FOOT} roughness={0.72} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.16, 0.18, 0.1]}>
        <mesh castShadow rotation={[0.12, -0.18, 0]} scale={[1.35, 0.32, 0.82]}>
          <sphereGeometry args={[0.16, compactLabels ? 10 : 14, compactLabels ? 8 : 10]} />
          <meshStandardMaterial color={PENGUIN_FOOT} roughness={0.72} />
        </mesh>
      </group>

      {/* penguin body */}
      <mesh castShadow position={[0, 0.86, 0]} scale={[0.82, 1.18, 0.72]}>
        <sphereGeometry args={[0.42, compactLabels ? 18 : 28, compactLabels ? 18 : 28]} />
        <meshStandardMaterial color={PENGUIN_BODY} roughness={0.56} metalness={0.02} emissive={color} emissiveIntensity={selected ? 0.18 : 0.06} />
      </mesh>
      <mesh castShadow position={[0, 0.82, 0.255]} scale={[0.58, 0.86, 0.12]}>
        <sphereGeometry args={[0.38, compactLabels ? 16 : 24, compactLabels ? 14 : 22]} />
        <meshStandardMaterial color={PENGUIN_BELLY} roughness={0.82} />
      </mesh>

      {/* flippers */}
      <group ref={leftArm} position={[-0.39, 0.98, 0.01]} rotation={[0.12, 0, 0.46]}>
        <mesh castShadow position={[0, -0.16, 0]} scale={[0.46, 1.22, 0.2]}>
          <sphereGeometry args={[0.2, compactLabels ? 10 : 14, compactLabels ? 10 : 14]} />
          <meshStandardMaterial color={PENGUIN_BODY} roughness={0.66} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.39, 0.98, 0.01]} rotation={[0.12, 0, -0.46]}>
        <mesh castShadow position={[0, -0.16, 0]} scale={[0.46, 1.22, 0.2]}>
          <sphereGeometry args={[0.2, compactLabels ? 10 : 14, compactLabels ? 10 : 14]} />
          <meshStandardMaterial color={PENGUIN_BODY} roughness={0.66} />
        </mesh>
      </group>

      {/* penguin head */}
      <mesh castShadow position={[0, 1.48, 0]} scale={[1.0, 0.92, 0.96]}>
        <sphereGeometry args={[0.31, compactLabels ? 16 : 26, compactLabels ? 16 : 26]} />
        <meshStandardMaterial color={PENGUIN_BODY} roughness={0.62} emissive={color} emissiveIntensity={selected ? 0.08 : 0.02} />
      </mesh>
      <mesh castShadow position={[0, 1.44, 0.245]} scale={[0.58, 0.55, 0.12]}>
        <sphereGeometry args={[0.28, compactLabels ? 14 : 22, compactLabels ? 12 : 20]} />
        <meshStandardMaterial color={PENGUIN_BELLY} roughness={0.76} />
      </mesh>
      <PenguinHat color={hatColor} compact={compactLabels} selected={selected} />
      <RoleAccessory lane={lane} compact={compactLabels} selected={selected} hatColor={hatColor} />
      {/* eyes + beak */}
      <mesh position={[-0.09, 1.53, 0.28]}>
        <sphereGeometry args={[0.035, compactLabels ? 8 : 10, compactLabels ? 8 : 10]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0.09, 1.53, 0.28]}>
        <sphereGeometry args={[0.035, compactLabels ? 8 : 10, compactLabels ? 8 : 10]} />
        <meshBasicMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, 1.455, 0.33]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[0.075, 0.18, compactLabels ? 10 : 14]} />
        <meshStandardMaterial color={PENGUIN_BEAK} roughness={0.62} />
      </mesh>

      {/* status beacon */}
      <mesh position={[0, 2.12, 0]}>
        <sphereGeometry args={[0.065, compactLabels ? 8 : 12, compactLabels ? 8 : 12]} />
        <meshBasicMaterial ref={dot} color={ringColor} transparent />
      </mesh>

      {/* cognition bubble: state-backed "mind" projection */}
      {showCognition && cognition && <CognitionBubble cognition={cognition} selected={selected} />}

      {/* nameplate */}
      {showNameplate && (
        <Html position={[0, 2.52, 0]} center distanceFactor={11} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
          <div
            style={{
              transform: "translateY(-50%)",
              whiteSpace: "nowrap",
              padding: "3px 9px",
              borderRadius: 9,
              fontSize: 11,
              fontWeight: 700,
              color: "#eaf0ff",
              background: selected ? "rgba(30,42,80,0.96)" : "rgba(12,18,36,0.82)",
              border: `1px solid ${ringColor}`,
              boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
              textAlign: "center",
            }}
          >
            <div>{firstName}</div>
            <div style={{ fontSize: 9, fontWeight: 500, color: "#9fb0d8", marginTop: 1 }}>{role}</div>
            {working ? <div style={{ fontSize: 8.5, fontWeight: 900, color: "#21d4a8", marginTop: 2 }}>업무중</div> : route?.note && <div style={{ fontSize: 8.5, fontWeight: 800, color: "#cbd8ff", marginTop: 2 }}>{route.note}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

function CognitionBubble({ cognition, selected }: { cognition: AgentCognition; selected: boolean }) {
  return (
    <group>
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[selected ? 0.105 : 0.085, 12, 12]} />
        <meshBasicMaterial color={cognition.color} transparent opacity={selected ? 0.96 : 0.78} />
      </mesh>
      <Html position={[0, selected ? 2.86 : 2.72, 0]} center distanceFactor={selected ? 10 : 12} zIndexRange={OFFICE_HTML_Z} pointerEvents="none">
        <div
          style={{
            minWidth: selected ? 150 : 82,
            maxWidth: selected ? 220 : 150,
            padding: selected ? "7px 10px" : "4px 8px",
            borderRadius: 12,
            background: "rgba(255,252,245,0.92)",
            border: `1px solid ${cognition.color}88`,
            boxShadow: `0 8px 20px ${cognition.color}22`,
            color: "#1f2933",
            textAlign: "center",
            whiteSpace: selected ? "normal" : "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 5, color: cognition.color, fontSize: selected ? 12 : 10.5, fontWeight: 900 }}>
            <span>{cognition.icon}</span>
            <span>{cognition.label}</span>
          </div>
          {selected && <div style={{ marginTop: 4, fontSize: 10.2, lineHeight: 1.32, color: "#4b5563" }}>{cognition.decision}</div>}
        </div>
      </Html>
    </group>
  );
}

function PenguinHat({ color, compact, selected }: { color: string; compact: boolean; selected: boolean }) {
  const glow = selected ? 0.42 : 0.16;
  return (
    <group>
      <mesh position={[0, 1.76, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.35, 0.1, compact ? 16 : 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.52} />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.24, compact ? 12 : 18, compact ? 8 : 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={glow} roughness={0.5} />
      </mesh>
      <mesh position={[0.21, 1.99, 0.02]} castShadow>
        <sphereGeometry args={[0.055, compact ? 8 : 10, compact ? 8 : 10]} />
        <meshStandardMaterial color="#fff7ed" roughness={0.72} />
      </mesh>
    </group>
  );
}

function RoleAccessory({ lane, compact, selected, hatColor }: { lane: LaneId; compact: boolean; selected: boolean; hatColor: string }) {
  const glow = selected ? 0.55 : 0.22;
  if (lane === "engineering") {
    return (
      <group>
        <mesh position={[0, 1.24, 0.31]} castShadow>
          <boxGeometry args={[0.42, 0.055, 0.08]} />
          <meshStandardMaterial color={hatColor} emissive={hatColor} emissiveIntensity={glow} roughness={0.48} />
        </mesh>
        <mesh position={[0.38, 1.02, 0.2]} rotation={[-0.18, -0.25, 0.08]} castShadow>
          <boxGeometry args={[0.34, 0.05, 0.24]} />
          <meshStandardMaterial color="#dbe7ff" emissive="#5b8cff" emissiveIntensity={0.24} roughness={0.4} />
        </mesh>
      </group>
    );
  }
  if (lane === "legal") {
    return (
      <group>
        <mesh position={[0, 1.23, 0.31]} castShadow>
          <cylinderGeometry args={[0.11, 0.15, 0.055, compact ? 12 : 18]} />
          <meshStandardMaterial color={hatColor} emissive={hatColor} emissiveIntensity={glow} roughness={0.45} />
        </mesh>
        <mesh position={[-0.38, 1.02, 0.2]} rotation={[0.2, 0.3, -0.18]} castShadow>
          <boxGeometry args={[0.08, 0.38, 0.28]} />
          <meshStandardMaterial color="#f4e7b8" emissive="#f5a524" emissiveIntensity={0.2} roughness={0.6} />
        </mesh>
      </group>
    );
  }
  if (lane === "operations") {
    return (
      <group>
        <mesh position={[0, 1.02, 0.34]} castShadow>
          <boxGeometry args={[0.48, 0.18, 0.055]} />
          <meshStandardMaterial color={hatColor} emissive={hatColor} emissiveIntensity={glow} roughness={0.58} />
        </mesh>
        <mesh position={[0.34, 1.06, 0.24]} rotation={[0.05, -0.35, 0]} castShadow>
          <boxGeometry args={[0.16, 0.32, 0.08]} />
          <meshStandardMaterial color="#9fe7cf" emissive="#21d4a8" emissiveIntensity={0.18} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh position={[0, 1.25, 0.32]} castShadow>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial color={hatColor} emissive={hatColor} emissiveIntensity={glow} roughness={0.42} />
      </mesh>
      <mesh position={[0, 1.13, 0.28]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.25, 0.25, 0.05]} />
        <meshStandardMaterial color="#ffd8a8" emissive="#f5a524" emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
    </group>
  );
}
