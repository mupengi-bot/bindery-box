import type { AgentStatus, LaneId } from "../types";

// Status → avatar accent + label. Mirrors the live-log level palette so the 3D
// agents read the same way the 2D overlays do.
export const STATUS_COLOR: Record<AgentStatus, string> = {
  running: "#21d4a8",
  idle: "#5b8cff",
  blocked: "#ff5d73",
  disabled: "#6b7494",
};

export const STATUS_RING: Record<AgentStatus, string> = {
  running: "#2af0c0",
  idle: "#7aa6ff",
  blocked: "#ff8095",
  disabled: "#8a93b4",
};

// Lane zones laid out as quadrants of the office floor (XZ plane, Y up).
// Each lane owns a coloured rug, a desk cluster and a wall sign.
export interface LaneZone {
  id: LaneId;
  label: string;
  glyph: string;
  color: string;
  /** Zone centre [x, z] and half-extents. */
  center: [number, number];
  half: [number, number];
}

export const LANE_ZONES: Record<LaneId, LaneZone> = {
  production: {
    id: "production",
    label: "생산 · Production",
    glyph: "▣",
    color: "#3b5bdb",
    center: [-9, -7],
    half: [8, 5.5],
  },
  sales: {
    id: "sales",
    label: "영업 · Sales",
    glyph: "◆",
    color: "#7048e8",
    center: [9, -7],
    half: [8, 5.5],
  },
  scope3: {
    id: "scope3",
    label: "Scope 3 · ESG",
    glyph: "❖",
    color: "#0ca678",
    center: [-9, 7],
    half: [8, 5.5],
  },
  control: {
    id: "control",
    label: "관제 · Control",
    glyph: "◈",
    color: "#e8590c",
    center: [9, 7],
    half: [8, 5.5],
  },
};

export const LANE_ORDER: LaneId[] = ["production", "sales", "scope3", "control"];

// Central plaza where "running" agents rally for a standup.
export const PLAZA: [number, number] = [0, 0];

export const FLOOR = { width: 42, depth: 34 };

// ---------------------------------------------------------------------------
// Office rooms & navigation graph
// ---------------------------------------------------------------------------
// The office is a small graph of named rooms. Each lane is a *department room*
// holding its agents' workstations plus an in-room "huddle" spot; the centre is
// a shared glass-walled *meeting room* where agents whose work is waiting for a
// human decision gather around the approval table. Avatars (3D) and the Mission
// Control minimap (2D) both consume this same geometry, so the two surfaces can
// never disagree about where an agent is — the renderer-agnostic projection
// contract described in docs/office-claw3d-bridge.md.

export type Vec2 = [number, number];

/** Central meeting room half-extents (centred on the plaza origin). */
export const MEETING_ROOM = { half: [4.6, 3.7] as Vec2 };

export interface OfficeRoom {
  id: LaneId | "meeting";
  label: string;
  glyph: string;
  color: string;
  center: Vec2;
  half: Vec2;
  /** Doorway on the room edge that faces the plaza/meeting room. */
  door: Vec2;
  /** In-room collaboration spot where "running" agents gather. */
  huddle: Vec2;
}

// Pull a point from a zone centre toward the plaza by a fraction of its extent.
function towardPlaza(center: Vec2, half: Vec2, fx: number, fz: number): Vec2 {
  return [center[0] - Math.sign(center[0]) * half[0] * fx, center[1] - Math.sign(center[1]) * half[1] * fz];
}

export const ROOMS: Record<LaneId, OfficeRoom> = LANE_ORDER.reduce((acc, id) => {
  const z = LANE_ZONES[id];
  acc[id] = {
    id,
    label: z.label,
    glyph: z.glyph,
    color: z.color,
    center: z.center,
    half: z.half,
    // door sits just outside the room, in the corridor toward the meeting room
    door: towardPlaza(z.center, z.half, 1.0, 1.0),
    // huddle sits inside the room near the door
    huddle: towardPlaza(z.center, z.half, 0.55, 0.5),
  };
  return acc;
}, {} as Record<LaneId, OfficeRoom>);

/** Ring of seats around the central meeting table. */
export function meetingSeat(index: number, total: number): Vec2 {
  const n = Math.max(total, 1);
  const a = -Math.PI / 2 + (index / n) * Math.PI * 2;
  const r = 2.5;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
