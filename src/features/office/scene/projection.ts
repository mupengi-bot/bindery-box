// Orchestration → office projection (Phase 3: 3D Projection Realization).
//
// Renderer-agnostic mapping that turns control-plane orchestration state
// (Mattermost threads, orchestration runs, produced artifacts) into *visible
// signals* placed in the 3D office. Like routing.ts, this keeps business state
// out of the renderer: the scene only consumes the projected signals, so the
// same projection could feed a 2D minimap or an imported Claw3D room set without
// changing the meaning of "this agent has an active run / this lane produced an
// artifact / this desk has an open thread".
//
// Invariant preserved: signals never *move* an avatar. They only colour desks,
// raise beacons, float artifact objects and tint zone status — locomotion stays
// operator-commanded (see routing.ts).

import type {
  Artifact,
  LaneId,
  OfficeThread,
  OrchestratorRun,
  WorkstreamAgent,
} from "../types";

// Run status → accent colour. Mirrors the live-log / status palette so a run
// marker reads the same way as the agent/desk it sits above.
export const RUN_STATUS_COLOR: Record<string, string> = {
  planned: "#8ea2d2",
  running: "#21d4a8",
  waiting_approval: "#f5a524",
  completed: "#5b8cff",
  failed: "#ff5d73",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  planned: "준비",
  running: "실행 중",
  waiting_approval: "승인 대기",
  completed: "완료",
  failed: "실패",
};

export function runStatusColor(status: string | undefined): string {
  return RUN_STATUS_COLOR[status ?? ""] ?? "#8ea2d2";
}

const ACTIVE_RUN = new Set(["planned", "running", "waiting_approval"]);

export type AgentCognitionState = "thinking" | "approval" | "blocked" | "done" | "idle";

export interface AgentCognition {
  state: AgentCognitionState;
  icon: string;
  label: string;
  goal: string;
  context: string;
  decision: string;
  risk: string;
  output: string | null;
  color: string;
}

/** Per-agent orchestration signal projected onto that agent's desk. */
export interface AgentSignal {
  agentId: string;
  /** Most relevant run for this agent (active first, else most recent). */
  primaryRun: OrchestratorRun | null;
  runCount: number;
  activeRunCount: number;
  threadCount: number;
  artifactCount: number;
  latestArtifactTitle: string | null;
  cognition: AgentCognition;
}

/** Per-lane orchestration signal projected onto that lane's zone. */
export interface LaneSignal {
  lane: LaneId;
  runCount: number;
  activeRunCount: number;
  threadCount: number;
  artifactCount: number;
  /** Aggregate zone status, severity-ordered. */
  status: "failed" | "waiting_approval" | "running" | "idle";
}

export interface OfficeSignals {
  byAgent: Map<string, AgentSignal>;
  byLane: Map<LaneId, LaneSignal>;
  totals: { threads: number; runs: number; activeRuns: number; artifacts: number };
}

function pickPrimaryRun(runs: OrchestratorRun[]): OrchestratorRun | null {
  if (runs.length === 0) return null;
  const active = runs.find((r) => ACTIVE_RUN.has(String(r.status)));
  if (active) return active;
  // Most recent by createdAt (string ISO sort), else last in list.
  return runs
    .slice()
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0] ?? runs[runs.length - 1];
}

function cognitionFromSignal(signal: Omit<AgentSignal, "cognition">): AgentCognition {
  const run = signal.primaryRun;
  const status = String(run?.status ?? "idle");
  const contextParts = [];
  if (signal.threadCount > 0) contextParts.push(`스레드 ${signal.threadCount}`);
  if (signal.runCount > 0) contextParts.push(`런 ${signal.runCount}`);
  if (signal.artifactCount > 0) contextParts.push(`산출물 ${signal.artifactCount}`);
  const context = contextParts.length > 0 ? contextParts.join(" · ") : "대기 컨텍스트 없음";

  if (status === "waiting_approval") {
    return {
      state: "approval",
      icon: "?",
      label: "승인대기",
      goal: run?.goal ?? "사람 승인 대기",
      context,
      decision: "사람 승인 후 다음 단계 실행",
      risk: run?.policyDecision ?? "외부 영향/정책 경계 확인 필요",
      output: signal.latestArtifactTitle,
      color: runStatusColor(status),
    };
  }
  if (status === "running" || status === "planned") {
    return {
      state: "thinking",
      icon: "…",
      label: status === "planned" ? "계획중" : "생각중",
      goal: run?.goal ?? "업무 실행 준비",
      context,
      decision: run?.note ?? "다음 액션 계산 중",
      risk: run?.policyDecision ?? "정책 경계 내 실행",
      output: signal.latestArtifactTitle,
      color: runStatusColor(status),
    };
  }
  if (status === "failed") {
    return {
      state: "blocked",
      icon: "!",
      label: "막힘",
      goal: run?.goal ?? "실패 원인 확인",
      context,
      decision: run?.note ?? "재시도 전 원인 분석 필요",
      risk: "실패/차단 상태",
      output: signal.latestArtifactTitle,
      color: runStatusColor(status),
    };
  }
  if (status === "completed" || signal.artifactCount > 0) {
    return {
      state: "done",
      icon: "✓",
      label: "산출완료",
      goal: run?.goal ?? "최근 산출물 정리",
      context,
      decision: "산출물 확인 또는 다음 업무 대기",
      risk: "낮음",
      output: signal.latestArtifactTitle,
      color: runStatusColor("completed"),
    };
  }
  return {
    state: "idle",
    icon: "○",
    label: "대기",
    goal: "새 목표 대기",
    context,
    decision: "업무 요청 또는 우클릭 배치 대기",
    risk: "낮음",
    output: null,
    color: "#8ea2d2",
  };
}

/**
 * Project orchestration state into per-agent + per-lane signals. Pure: the same
 * inputs always yield the same signals (no Date.now / Math.random), so it is
 * safe in the stateless cloud demo and unit-testable.
 */
export function projectOfficeSignals({
  agents,
  threads,
  runs,
  artifacts,
}: {
  agents: WorkstreamAgent[];
  threads: OfficeThread[];
  runs: OrchestratorRun[];
  artifacts: Artifact[];
}): OfficeSignals {
  const laneOf = new Map<string, LaneId>(agents.map((a) => [a.id, a.lane]));
  // task → agent, so thread/artifact linked by task can be attributed to a desk.
  const runById = new Map(runs.map((r) => [r.id, r]));
  const agentByTask = new Map<string, string>();
  for (const r of runs) {
    if (r.taskId && r.agentId) agentByTask.set(r.taskId, r.agentId);
  }

  const byAgent = new Map<string, AgentSignal>();
  const ensureAgent = (agentId: string): AgentSignal => {
    const existing = byAgent.get(agentId);
    if (existing) return existing;
    const s: AgentSignal = {
      agentId,
      primaryRun: null,
      runCount: 0,
      activeRunCount: 0,
      threadCount: 0,
      artifactCount: 0,
      latestArtifactTitle: null,
      cognition: {
        state: "idle",
        icon: "○",
        label: "대기",
        goal: "새 목표 대기",
        context: "대기 컨텍스트 없음",
        decision: "업무 요청 또는 우클릭 배치 대기",
        risk: "낮음",
        output: null,
        color: "#8ea2d2",
      },
    };
    byAgent.set(agentId, s);
    return s;
  };

  // Runs grouped per agent.
  const runsByAgent = new Map<string, OrchestratorRun[]>();
  for (const r of runs) {
    if (!r.agentId) continue;
    const list = runsByAgent.get(r.agentId) ?? [];
    list.push(r);
    runsByAgent.set(r.agentId, list);
  }
  for (const [agentId, list] of runsByAgent) {
    const s = ensureAgent(agentId);
    s.runCount = list.length;
    s.activeRunCount = list.filter((r) => ACTIVE_RUN.has(String(r.status))).length;
    s.primaryRun = pickPrimaryRun(list);
  }

  // Threads attributed to a desk via their linked work item's run agent.
  for (const t of threads) {
    const agentId = t.linkedWorkItemId ? agentByTask.get(t.linkedWorkItemId) : undefined;
    if (agentId && laneOf.has(agentId)) ensureAgent(agentId).threadCount += 1;
  }

  // Artifacts attributed to a desk via their source run's agent.
  for (const a of artifacts) {
    const run = a.sourceRunId ? runById.get(a.sourceRunId) : undefined;
    const agentId = run?.agentId;
    if (agentId && laneOf.has(agentId)) {
      const s = ensureAgent(agentId);
      s.artifactCount += 1;
      if (!s.latestArtifactTitle) s.latestArtifactTitle = a.title;
    }
  }

  // Cognition packets: state-backed "mind" visible above penguins and in HUD.
  for (const s of byAgent.values()) {
    s.cognition = cognitionFromSignal(s);
  }

  // Lane aggregation.
  const byLane = new Map<LaneId, LaneSignal>();
  const ensureLane = (lane: LaneId): LaneSignal => {
    let s = byLane.get(lane);
    if (!s) {
      s = { lane, runCount: 0, activeRunCount: 0, threadCount: 0, artifactCount: 0, status: "idle" };
      byLane.set(lane, s);
    }
    return s;
  };
  const laneHasFailure = new Set<LaneId>();
  const laneHasApproval = new Set<LaneId>();
  const laneHasRunning = new Set<LaneId>();
  for (const [agentId, s] of byAgent) {
    const lane = laneOf.get(agentId);
    if (!lane) continue;
    const ls = ensureLane(lane);
    ls.runCount += s.runCount;
    ls.activeRunCount += s.activeRunCount;
    ls.threadCount += s.threadCount;
    ls.artifactCount += s.artifactCount;
    const st = String(s.primaryRun?.status ?? "");
    if (st === "failed") laneHasFailure.add(lane);
    else if (st === "waiting_approval") laneHasApproval.add(lane);
    else if (st === "running" || st === "planned") laneHasRunning.add(lane);
  }
  for (const [lane, ls] of byLane) {
    ls.status = laneHasFailure.has(lane)
      ? "failed"
      : laneHasApproval.has(lane)
        ? "waiting_approval"
        : laneHasRunning.has(lane)
          ? "running"
          : "idle";
  }

  return {
    byAgent,
    byLane,
    totals: {
      threads: threads.length,
      runs: runs.length,
      activeRuns: runs.filter((r) => ACTIVE_RUN.has(String(r.status))).length,
      artifacts: artifacts.length,
    },
  };
}
