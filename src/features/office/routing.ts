// Office navigation semantics — the renderer-agnostic projection that turns
// workstream state into *where an agent goes*. Both the 3D scene and the
// Mission Control minimap import this so the two surfaces always agree.
//
// An agent's destination is derived purely from its live status and the mission
// it owns:
//   • meeting  — its active mission is waiting on a human decision → walk to the
//                central meeting room and take an approval-table seat.
//   • huddle   — it is running work → leave the desk for the in-room huddle spot.
//   • desk     — idle / blocked / disabled → stay at the workstation.
// The waypoint polyline routes the avatar out through the room door so it never
// clips through a wall.

import { ROOMS, meetingSeat, type Vec2 } from "./scene/sceneConfig";
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
  desk: "데스크",
  huddle: "협업 허들",
  meeting: "회의실 · 승인",
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

function pickDestination(agent: WorkstreamAgent, mission: Mission | null): Destination {
  if (agent.status === "blocked" || agent.status === "disabled") return "desk";
  if (mission && (mission.status === "waiting_approval" || mission.requiresApproval)) return "meeting";
  if (agent.status === "running") return "huddle";
  return "desk";
}

/**
 * Build the route for a single agent.
 * @param seat        the agent's desk seat [x, z]
 * @param meetingIdx  this agent's index among meeting-bound agents (seat ring)
 * @param meetingTot  total meeting-bound agents (ring size)
 */
export function deriveRoute(
  agent: WorkstreamAgent,
  seat: Vec2,
  missions: Mission[],
  meetingIdx: number,
  meetingTot: number,
): AgentRoute {
  const mission = activeMissionFor(agent, missions);
  const destination = pickDestination(agent, mission);
  const room = ROOMS[agent.lane];

  let waypoints: Vec2[];
  if (destination === "meeting") {
    waypoints = [seat, room.huddle, room.door, meetingSeat(meetingIdx, meetingTot)];
  } else if (destination === "huddle") {
    waypoints = [seat, room.huddle];
  } else {
    waypoints = [seat];
  }

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
  const meetingBound = agents.filter((a) => {
    const m = activeMissionFor(a, missions);
    return pickDestination(a, m) === "meeting";
  });
  const meetingIndex = new Map(meetingBound.map((a, i) => [a.id, i]));
  const total = meetingBound.length;

  const out = new Map<string, AgentRoute>();
  for (const a of agents) {
    out.set(a.id, deriveRoute(a, seatOf(a.id), missions, meetingIndex.get(a.id) ?? 0, total));
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
