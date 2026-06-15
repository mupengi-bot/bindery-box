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
  engineering: {
    id: "engineering",
    label: "Engineering · GitHub",
    glyph: "⌘",
    color: "#3b5bdb",
    center: [-9, -7],
    half: [8, 5.5],
  },
  legal: {
    id: "legal",
    label: "Legal · Contracts",
    glyph: "§",
    color: "#7048e8",
    center: [9, -7],
    half: [8, 5.5],
  },
  operations: {
    id: "operations",
    label: "Operations · Mattermost",
    glyph: "◆",
    color: "#0ca678",
    center: [-9, 7],
    half: [8, 5.5],
  },
  control: {
    id: "control",
    label: "Control · Governance",
    glyph: "◈",
    color: "#e8590c",
    center: [9, 7],
    half: [8, 5.5],
  },
};

export const LANE_ORDER: LaneId[] = ["engineering", "legal", "operations", "control"];

// Central plaza where "running" agents rally for a standup.
export const PLAZA: [number, number] = [0, 0];

export const FLOOR = { width: 42, depth: 34 };

export type OfficeVisualThemeId = "comfort" | "night";

export interface OfficeVisualTheme {
  id: OfficeVisualThemeId;
  canvas: string;
  fog: string;
  floor: string;
  floorGrid: string;
  plaza: string;
  sign: string;
  signEmissive: string;
  wall: string;
  glass: string;
  desk: string;
  deskTop: string;
  paper: string;
  plantPot: string;
  shelf: string;
  shadow: string;
  labelBg: string;
  labelText: string;
  labelMuted: string;
  laneOpacity: number;
  gridOpacity: number;
}

export const OFFICE_VISUAL_THEMES: Record<OfficeVisualThemeId, OfficeVisualTheme> = {
  comfort: {
    id: "comfort",
    canvas: "#f5f2ea",
    fog: "#f5f2ea",
    floor: "#e8e1d4",
    floorGrid: "#8a7b66",
    plaza: "#f4efe5",
    sign: "#fffaf0",
    signEmissive: "#f4b860",
    wall: "#f8f6f0",
    glass: "#d8e5f2",
    desk: "#c8a97e",
    deskTop: "#e9d6b8",
    paper: "#fffaf0",
    plantPot: "#f4efe5",
    shelf: "#d9c7aa",
    shadow: "#b4a58e",
    labelBg: "rgba(255,252,245,0.9)",
    labelText: "#1f2933",
    labelMuted: "#667085",
    laneOpacity: 0.2,
    gridOpacity: 0.12,
  },
  night: {
    id: "night",
    canvas: "#070b16",
    fog: "#070b16",
    floor: "#0d1425",
    floorGrid: "#26304e",
    plaza: "#161d33",
    sign: "#0c1226",
    signEmissive: "#1b2750",
    wall: "#2a3252",
    glass: "#a8c7ff",
    desk: "#26314f",
    deskTop: "#26314f",
    paper: "#eaf0ff",
    plantPot: "#f4efe5",
    shelf: "#19223b",
    shadow: "#020611",
    labelBg: "rgba(9,14,29,0.86)",
    labelText: "#eaf0ff",
    labelMuted: "#9fb0d8",
    laneOpacity: 0.32,
    gridOpacity: 0.28,
  },
};

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
