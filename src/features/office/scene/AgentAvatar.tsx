"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AgentStatus } from "../types";
import { STATUS_COLOR, STATUS_RING } from "./sceneConfig";

export interface AgentAvatarProps {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus;
  /** Desk seat position [x, z]. */
  home: [number, number];
  /** Rally point [x, z] running agents walk toward. */
  rally: [number, number];
  /** Deterministic phase offset so avatars don't move in lockstep. */
  phase: number;
  selected: boolean;
  onSelect: (id: string) => void;
}

const easeInOut = (t: number) => t * t * (3 - 2 * t);

// A procedural, Claw3D-style office employee: capsule torso, sphere head,
// swinging arms/legs, a status halo and a floating nameplate. Running agents
// walk a path between their desk and the standup plaza; everyone else idles at
// the desk with a subtle breathing bob.
export function AgentAvatar({
  agentId,
  name,
  role,
  status,
  home,
  rally,
  phase,
  selected,
  onSelect,
}: AgentAvatarProps) {
  const group = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const dot = useRef<THREE.MeshBasicMaterial>(null);

  const t = useRef(Math.abs(Math.sin(phase)) * 0.6);
  const dir = useRef(1);
  const prev = useRef(new THREE.Vector3(home[0], 0, home[1]));
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const homeVec = useMemo(() => new THREE.Vector3(home[0], 0, home[1]), [home]);
  const rallyVec = useMemo(() => new THREE.Vector3(rally[0], 0, rally[1]), [rally]);

  const color = STATUS_COLOR[status];
  const ringColor = STATUS_RING[status];
  const moving = status === "running";
  const firstName = useMemo(() => name.split(" ")[0] ?? name, [name]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const time = state.clock.elapsedTime + phase;

    // --- locomotion target ---
    if (moving) {
      t.current += dir.current * delta * 0.32;
      if (t.current >= 1) {
        t.current = 1;
        dir.current = -1;
      } else if (t.current <= 0) {
        t.current = 0;
        dir.current = 1;
      }
      tmp.copy(homeVec).lerp(rallyVec, easeInOut(t.current));
    } else {
      tmp.copy(homeVec);
    }
    g.position.lerp(tmp, 0.08);

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
      const s = 1 + (moving ? Math.sin(time * 4) * 0.12 : Math.sin(time * 2) * 0.04);
      ring.current.scale.set(s, s, s);
    }
    if (dot.current) {
      dot.current.opacity = 0.55 + Math.abs(Math.sin(time * 3)) * 0.45;
    }
  });

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
        <ringGeometry args={[0.42, 0.56, 40]} />
        <meshBasicMaterial color={ringColor} transparent opacity={selected ? 0.95 : 0.5} side={THREE.DoubleSide} />
      </mesh>

      {/* legs */}
      <group ref={leftLeg} position={[-0.13, 0.5, 0]}>
        <mesh castShadow position={[0, -0.25, 0]}>
          <capsuleGeometry args={[0.1, 0.4, 4, 8]} />
          <meshStandardMaterial color="#2a3350" roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.13, 0.5, 0]}>
        <mesh castShadow position={[0, -0.25, 0]}>
          <capsuleGeometry args={[0.1, 0.4, 4, 8]} />
          <meshStandardMaterial color="#2a3350" roughness={0.8} />
        </mesh>
      </group>

      {/* torso */}
      <mesh castShadow position={[0, 0.92, 0]}>
        <capsuleGeometry args={[0.27, 0.5, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} emissive={color} emissiveIntensity={selected ? 0.35 : 0.14} />
      </mesh>

      {/* arms */}
      <group ref={leftArm} position={[-0.32, 1.12, 0]}>
        <mesh castShadow position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.075, 0.36, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.32, 1.12, 0]}>
        <mesh castShadow position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.075, 0.36, 4, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      </group>

      {/* head */}
      <mesh castShadow position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshStandardMaterial color="#f1d6b8" roughness={0.7} />
      </mesh>
      {/* eyes */}
      <mesh position={[-0.09, 1.53, 0.22]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#1b2233" />
      </mesh>
      <mesh position={[0.09, 1.53, 0.22]}>
        <sphereGeometry args={[0.035, 10, 10]} />
        <meshBasicMaterial color="#1b2233" />
      </mesh>

      {/* status beacon */}
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial ref={dot} color={ringColor} transparent />
      </mesh>

      {/* nameplate */}
      <Html position={[0, 2.35, 0]} center distanceFactor={11} zIndexRange={[20, 0]} pointerEvents="none">
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
        </div>
      </Html>
    </group>
  );
}
