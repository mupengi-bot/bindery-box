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
