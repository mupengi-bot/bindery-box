// Office navigation semantics — the renderer-agnostic projection that turns
// workstream state into *where an agent goes*. Both the 3D scene and the
// Mission Control minimap import this so the two surfaces always agree.
//
// Physical navigation is operator-commanded only. Runtime status may change an
// agent's color, KPI panel, log row, or desk activity, but it must not make the
// avatar walk away by itself. This keeps the RTS office legible: people move only
// after a floor/right-click/zone move command is issued. Automatic work routing
// belongs in logs and HUD state, not in avatar locomotion.

import { type Vec2 } from "./scene/sceneConfig";
import type { Mission, WorkstreamAgent } from "./types";

export type Destination = "desk" | "huddle" | "meeting";

export interface AgentRoute {
  agentId: string;
  destination: Destination;
  /** Short, human-readable routing note for nameplates / HUD. */
  note: string;
  /** Polyline in floor XZ space, starting at the desk seat. */
  waypoints: Vec2[];
  /** Endpoint (final waypoint) — handy for the minimap dot. */
  target: Vec2;
  /** Whether the agent is actively travelling (vs. parked at the desk). */
  moving: boolean;
}

const DEST_NOTE: Record<Destination, string> = {
  desk: "데스크 · 대기/업무",
  huddle: "수동 이동",
  meeting: "수동 이동",
};

/** The mission an agent is actively working, if any. */
export function activeMissionFor(agent: WorkstreamAgent, missions: Mission[]): Mission | null {
  const owned = missions.filter((m) => m.agentId === agent.id);
  return (
    owned.find((m) => m.status === "waiting_approval") ??
    owned.find((m) => m.status === "running") ??
    null
  );
}

function pickDestination(): Destination {
  return "desk";
}

/**
 * Build the route for a single agent. Base projection never moves avatars by
 * status; manual move commands are layered on top by OfficeScene.moveTargets.
 */
export function deriveRoute(
  agent: WorkstreamAgent,
  seat: Vec2,
  _missions: Mission[],
  _meetingIdx: number,
  _meetingTot: number,
): AgentRoute {
  const destination = pickDestination();

  const waypoints: Vec2[] = [seat];

  return {
    agentId: agent.id,
    destination,
    note: DEST_NOTE[destination],
    waypoints,
    target: waypoints[waypoints.length - 1],
    moving: waypoints.length > 1,
  };
}

/**
 * Derive routes for the whole roster, assigning stable meeting-seat indices so
 * agents in the meeting room never share a chair.
 */
export function deriveRoutes(
  agents: WorkstreamAgent[],
  seatOf: (agentId: string) => Vec2,
  missions: Mission[],
): Map<string, AgentRoute> {
  const out = new Map<string, AgentRoute>();
  for (const a of agents) {
    out.set(a.id, deriveRoute(a, seatOf(a.id), missions, 0, agents.length));
  }
  return out;
}

/** Sample a point along a polyline at parameter t∈[0,1] (by arc length). */
export function sampleRoute(waypoints: Vec2[], t: number): Vec2 {
  if (waypoints.length === 1) return waypoints[0];
  const segs: { a: Vec2; b: Vec2; len: number }[] = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, len });
    total += len;
  }
  if (total === 0) return waypoints[0];
  let d = Math.min(Math.max(t, 0), 1) * total;
  for (const s of segs) {
    if (d <= s.len || s === segs[segs.length - 1]) {
      const f = s.len === 0 ? 0 : d / s.len;
      return [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f];
    }
    d -= s.len;
  }
  return waypoints[waypoints.length - 1];
}
