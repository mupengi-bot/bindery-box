"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { OfficeVisualTheme } from "./sceneConfig";

export interface DeskProps {
  position: [number, number, number];
  rotation?: number;
  /** Screen accent colour (lane / status tinted). */
  screenColor: string;
  /** Animate the monitor glow when the owning agent is active. */
  active?: boolean;
  visualTheme?: OfficeVisualTheme;
}

// A retro low-poly workstation: desk slab, two monitors with an emissive
// screen, a chair and a desk lamp. The screen brightness pulses while the
// owning agent is running so the office reads as "alive" from across the room.
export function Desk({ position, rotation = 0, screenColor, active = false, visualTheme }: DeskProps) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const deskColor = visualTheme?.desk ?? "#6b4a2f";
  const legColor = visualTheme?.id === "comfort" ? "#7b6b5b" : "#3a3a44";
  const monitorColor = visualTheme?.id === "comfort" ? "#f3f0e8" : "#16181f";
  const chairColor = visualTheme?.id === "comfort" ? "#d7c6ad" : "#23262f";
  const baseColor = visualTheme?.id === "comfort" ? "#8a7b66" : "#2a2c34";

  useFrame((state) => {
    if (!screen.current) return;
    const base = active ? 0.9 : 0.4;
    screen.current.emissiveIntensity = active
      ? base + Math.sin(state.clock.elapsedTime * 5) * 0.35
      : base;
  });

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* desk top */}
      <mesh castShadow receiveShadow position={[0, 0.74, 0]}>
        <boxGeometry args={[1.7, 0.07, 0.85]} />
        <meshStandardMaterial color={deskColor} roughness={0.65} />
      </mesh>
      {/* legs */}
      {[
        [-0.78, -0.36],
        [0.78, -0.36],
        [-0.78, 0.36],
        [0.78, 0.36],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.37, z]}>
          <boxGeometry args={[0.07, 0.74, 0.07]} />
          <meshStandardMaterial color={legColor} roughness={0.7} metalness={0.08} />
        </mesh>
      ))}
      {/* monitor */}
      <group position={[0, 0.78, -0.2]}>
        <mesh castShadow position={[0, 0.34, 0]}>
          <boxGeometry args={[0.78, 0.46, 0.05]} />
          <meshStandardMaterial color={monitorColor} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.34, 0.03]}>
          <planeGeometry args={[0.68, 0.36]} />
          <meshStandardMaterial
            ref={screen}
            color={screenColor}
            emissive={screenColor}
            emissiveIntensity={0.4}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.16, 8]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.26, 0.02, 0.16]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
      </group>
      {/* chair */}
      <group position={[0, 0, 0.7]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color={chairColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.72, 0.22]}>
          <boxGeometry args={[0.5, 0.5, 0.08]} />
          <meshStandardMaterial color={chairColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.45, 8]} />
          <meshStandardMaterial color={baseColor} />
        </mesh>
      </group>
    </group>
  );
}
