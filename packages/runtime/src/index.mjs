// @bindery-box/runtime
// Runtime Plane. Every mutating flow follows the platform invariant:
//   Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Project
// (docs/architecture/runtime-events.md, platform-first-architecture.md)
import {
  ApprovalStatus,
  TaskStatus,
  AgentStatus,
  createTaskRun,
  createApprovalRequest,
  createAuditEvent,
  nowIso
} from "../../domain/src/index.mjs";
import {
  CommandType,
  EventType,
  validateCommand,
  makeEvent
} from "../../contracts/src/index.mjs";
import { Decision, defaultPolicy } from "../../policy/src/index.mjs";
import { createDemoState } from "../../domain/src/index.mjs";

export { createDemoState };
export { CommandType, EventType } from "../../contracts/src/index.mjs";
export function seedDemoState() {
  return createDemoState();
}

export function deriveMetrics(state) {
  return {
    activeAgents: state.agents.filter((a) => a.status !== AgentStatus.disabled).length,
    queuedTasks: state.tasks.filter((t) => t.status === TaskStatus.queued).length,
    runningTasks: state.tasks.filter((t) => t.status === TaskStatus.running).length,
    waitingApproval: state.tasks.filter((t) => t.status === TaskStatus.waitingApproval).length,
    pendingApprovals: state.approvals.filter((a) => a.status === ApprovalStatus.pending).length,
    completedTasks: state.tasks.filter((t) => t.status === TaskStatus.completed).length,
    officeEvents: state.officeEvents?.length ?? 0,
    manufacturingKpis: state.metrics?.manufacturingKpis ?? []
  };
}

// --- internal helpers -------------------------------------------------------

function taskResult(task) {
  if (task.category === "production") return "생산 2라인 지연 가능성 높음. 원인: 원자재 입고 지연·설비 점검 대기. 권장 조치: 구매팀 확인, 야간조 증원 검토.";
  if (task.category === "sales") return "고객 A/B/C에 대한 후속 메시지 초안 작성 완료. 외부 발송 전 관리자 승인이 필요함.";
  if (task.category === "scope3") return "공급사 4곳의 배출계수·전력사용량 데이터가 누락됨. 자료 요청 메일 초안 생성 완료.";
  return "업무 실행 결과 초안 생성 완료.";
}

// Creates a collector that records events + matching audit entries for one
// command, keeping the append-only log and human-readable audit log in sync.
function createCollector(state) {
  const events = [];
  return {
    events,
    emit(type, payload, audit) {
      const event = makeEvent(type, payload);
      events.push(event);
      if (audit) {
        state.auditEvents.unshift(createAuditEvent({
          ts: nowIso(),
          actorType: audit.actorType ?? "system",
          actor: audit.actor ?? "system",
          action: type,
          target: audit.target ?? "",
          message: audit.message ?? ""
        }));
      }
      return event;
    }
  };
}

// --- command handlers -------------------------------------------------------

function handleTaskRun(state, command, policy) {
  const c = createCollector(state);
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (!task) throw new Error(`Task not found: ${command.taskId}`);
  const agent = state.agents.find((a) => a.id === (task.assignedAgentId ?? task.ownerAgentId));
  if (!agent) throw new Error(`Agent not found for task: ${command.taskId}`);

  // 1) Policy check BEFORE any side effect.
  const verdict = policy.evaluateTaskRun(task, agent);

  if (verdict.decision === Decision.block) {
    task.status = TaskStatus.queued;
    agent.status = AgentStatus.blocked;
    c.emit(EventType.toolCallBlocked, { taskId: task.id, reason: verdict.reason },
      { actorType: "agent", actor: agent.name, target: task.id, message: `차단됨: ${verdict.reason}` });
    return { ok: false, decision: verdict.decision, events: c.events, result: { task, blocked: verdict } };
  }

  // 2) Start the run.
  const run = createTaskRun({ taskId: task.id, workspaceId: task.workspaceId, agentId: agent.id, capabilities: verdict.capabilities });
  state.taskRuns.unshift(run);
  agent.status = AgentStatus.running;
  task.status = TaskStatus.running;
  task.lastRunId = run.id;
  c.emit(EventType.taskRunStarted, { taskRunId: run.id, taskId: task.id, agentId: agent.id, taskTitle: task.title },
    { actorType: "agent", actor: agent.name, target: task.id, message: `${task.title} 실행 시작` });

  // 3) Produce the result.
  const summary = taskResult(task);
  run.resultSummary = summary;
  task.output = summary;
  agent.status = AgentStatus.idle;

  // 4) Approval gate.
  if (verdict.decision === Decision.requireApproval) {
    const approval = createApprovalRequest({
      taskId: task.id,
      taskRunId: run.id,
      workspaceId: task.workspaceId,
      title: `${task.title} 승인 요청`,
      requestedByAgentId: agent.id,
      reason: verdict.reason,
      summary
    });
    state.approvals.unshift(approval);
    run.status = TaskStatus.waitingApproval;
    task.status = TaskStatus.waitingApproval;
    c.emit(EventType.toolCallPendingApproval, { taskRunId: run.id, approvalId: approval.id });
    c.emit(EventType.approvalRequested,
      { approvalId: approval.id, workspaceId: task.workspaceId, taskRunId: run.id, reason: verdict.reason },
      { actorType: "agent", actor: agent.name, target: approval.id, message: `${task.title} 승인 요청 생성` });
    return { ok: true, decision: verdict.decision, events: c.events, result: { task, run, approval } };
  }

  // 5) Allowed outright -> complete.
  run.status = TaskStatus.completed;
  run.completedAt = nowIso();
  task.status = TaskStatus.completed;
  c.emit(EventType.toolCallCompleted, { taskRunId: run.id, outputPreviewRef: task.id });
  c.emit(EventType.taskRunCompleted, { taskRunId: run.id, taskId: task.id, resultSummary: summary },
    { actorType: "agent", actor: agent.name, target: task.id, message: summary });
  return { ok: true, decision: verdict.decision, events: c.events, result: { task, run } };
}

function handleApprovalDecide(state, command) {
  const c = createCollector(state);
  const approval = state.approvals.find((a) => a.id === command.approvalId);
  if (!approval) throw new Error(`Approval not found: ${command.approvalId}`);

  const approved = command.decision === "approved";
  approval.status = approved ? ApprovalStatus.approved : ApprovalStatus.rejected;
  approval.decision = command.decision;
  approval.decidedByUserId = command.decidedBy;
  approval.decidedAt = nowIso();

  const task = state.tasks.find((t) => t.id === approval.taskId);
  const run = state.taskRuns.find((r) => r.id === approval.taskRunId);

  if (approved) {
    if (task) task.status = TaskStatus.completed;
    if (run) { run.status = TaskStatus.completed; run.completedAt = nowIso(); }
    c.emit(EventType.taskRunCompleted,
      { taskRunId: approval.taskRunId, taskId: approval.taskId, resultSummary: approval.summary },
      { actorType: "human", actor: command.decidedBy, target: approval.id, message: `${approval.title} 승인 완료` });
  } else {
    if (task) task.status = TaskStatus.failed;
    if (run) { run.status = TaskStatus.failed; run.completedAt = nowIso(); run.error = "approval_rejected"; }
    c.emit(EventType.taskRunFailed,
      { taskRunId: approval.taskRunId, taskId: approval.taskId, error: "approval_rejected" },
      { actorType: "human", actor: command.decidedBy, target: approval.id, message: `${approval.title} 반려` });
  }

  c.emit(EventType.approvalDecided,
    { approvalId: approval.id, decision: command.decision, decidedBy: command.decidedBy },
    { actorType: "human", actor: command.decidedBy, target: approval.id, message: `승인 결정: ${command.decision}` });

  return { ok: true, decision: command.decision, events: c.events, result: { approval, task } };
}

// --- public dispatch --------------------------------------------------------

// Mutates `state`, returns { ok, events, result }. Projects events to the
// office adapter (if provided) and appends to the append-only event log.
export function dispatch(state, command, options = {}) {
  const policy = options.policy ?? defaultPolicy;
  const office = options.office ?? null;

  const { ok, errors } = validateCommand(command);
  if (!ok) throw new Error(`Invalid command: ${errors.join("; ")}`);

  let outcome;
  switch (command.type) {
    case CommandType.taskRun:
      outcome = handleTaskRun(state, command, policy);
      break;
    case CommandType.approvalDecide:
      outcome = handleApprovalDecide(state, command);
      break;
    default:
      throw new Error(`Unsupported command type: ${command.type}`);
  }

  // Append-only event log.
  state.events = state.events ?? [];
  state.events.push(...outcome.events);

  // Project to Office Plane.
  if (office) {
    const posts = office.handleEvents(outcome.events);
    state.officeEvents = state.officeEvents ?? [];
    state.officeEvents.push(...posts);
    for (const post of posts) {
      state.auditEvents.unshift(createAuditEvent({
        ts: nowIso(),
        actorType: "system",
        actor: "office.mattermost-mock",
        action: EventType.officeMessagePosted,
        target: post.channelRef,
        message: post.text
      }));
    }
    outcome.result.officePosts = posts;
  }

  return outcome;
}

// Load -> dispatch -> persist. Demonstrates the full persistence flow.
export async function executeCommand({ store, command, policy, office }) {
  const state = await store.load();
  const outcome = dispatch(state, command, { policy, office });
  await store.save(state);
  return { ...outcome, state };
}

// --- projection -------------------------------------------------------------

// Mission Control overview projection for GET /api/workspaces/:id/overview.
export function projectOverview(state, workspaceId) {
  const wsId = workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : workspaceId;
  const inWs = (item) => !item.workspaceId || item.workspaceId === wsId;
  return {
    tenant: state.tenant,
    workspace: state.workspace,
    metrics: deriveMetrics(state),
    agents: state.agents.filter(inWs),
    tasks: state.tasks.filter(inWs),
    approvals: state.approvals.filter(inWs),
    auditEvents: state.auditEvents.slice(0, 25),
    officeEvents: (state.officeEvents ?? []).slice(-25).reverse(),
    eventCount: state.events?.length ?? 0
  };
}

// --- live operations log projection -----------------------------------------
//
// Live Operations Log: a time-ordered merge of the four activity planes so the
// client can watch agents being invoked and their results stream in, even in
// the cloud demo. Sources:
//   * runtime — append-only event log (command -> event flow)
//   * agent   — task runs (an agent picking up work + its produced answer)
//   * audit   — human-readable audit trail
//   * office  — Mattermost-mock channel posts
// Every entry is { id, ts, source, level, actor, channel, action, message }.
const LIVE_EVENT_META = Object.freeze({
  "task.run.started": { level: "running", label: "업무 실행 시작" },
  "task.run.completed": { level: "success", label: "업무 완료" },
  "task.run.failed": { level: "error", label: "업무 실패" },
  "tool.call.requested": { level: "info", label: "툴 호출 요청" },
  "tool.call.blocked": { level: "error", label: "툴 호출 차단" },
  "tool.call.pending-approval": { level: "pending", label: "승인 대기 전환" },
  "tool.call.completed": { level: "success", label: "툴 호출 완료" },
  "approval.requested": { level: "pending", label: "승인 요청" },
  "approval.decided": { level: "info", label: "승인 결정" },
  "office.message.posted": { level: "info", label: "오피스 게시" }
});

function liveEventDetail(event) {
  return event.taskTitle
    || event.resultSummary
    || event.reason
    || (event.decision ? `결정: ${event.decision}` : "")
    || event.taskId
    || event.approvalId
    || event.taskRunId
    || "런타임 이벤트";
}

const NEGATIVE_RE = /(fail|block|reject|error|실패|차단|반려|거부)/i;

export function projectLiveLog(state, workspaceId, { limit = 80 } = {}) {
  const wsId = workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : workspaceId;
  const inWs = (item) => !item.workspaceId || item.workspaceId === wsId;
  const agentName = (id) => state.agents?.find((a) => a.id === id)?.name ?? id ?? "agent";
  const taskTitle = (id) => state.tasks?.find((t) => t.id === id)?.title ?? id ?? "task";
  const entries = [];

  // 1) Runtime plane — the append-only event log.
  for (const event of state.events ?? []) {
    const meta = LIVE_EVENT_META[event.type] ?? { level: "info", label: event.type };
    entries.push({
      id: event.id,
      ts: event.occurredAt,
      source: "runtime",
      level: meta.level,
      actor: "runtime",
      channel: null,
      action: event.type,
      message: `${meta.label} · ${liveEventDetail(event)}`
    });
  }

  // 2) Agent plane — task runs surface the agent picking up work + its answer.
  for (const run of state.taskRuns ?? []) {
    if (!inWs(run)) continue;
    entries.push({
      id: `${run.id}:start`,
      ts: run.startedAt,
      source: "agent",
      level: "running",
      actor: agentName(run.agentId),
      channel: null,
      action: "agent.work.started",
      message: `${taskTitle(run.taskId)} 처리 시작`
    });
    if (run.resultSummary) {
      entries.push({
        id: `${run.id}:result`,
        ts: run.completedAt ?? run.startedAt,
        source: "agent",
        level: run.status === "failed" ? "error" : run.status === "waiting_approval" ? "pending" : "success",
        actor: agentName(run.agentId),
        channel: null,
        action: "agent.work.result",
        message: run.resultSummary
      });
    }
  }

  // 3) Audit plane — skip office mirror rows (the office plane covers them).
  for (const ev of state.auditEvents ?? []) {
    if (!inWs(ev)) continue;
    if (ev.actor === "office.mattermost-mock") continue;
    entries.push({
      id: ev.id,
      ts: ev.ts ?? ev.createdAt,
      source: "audit",
      level: NEGATIVE_RE.test(`${ev.action} ${ev.message}`) ? "error" : "info",
      actor: ev.actor,
      channel: ev.target || null,
      action: ev.action,
      message: ev.message || ev.action
    });
  }

  // 4) Office plane — Mattermost-mock channel feed.
  for (const post of state.officeEvents ?? []) {
    entries.push({
      id: post.id,
      ts: post.postedAt,
      source: "office",
      level: NEGATIVE_RE.test(post.text) ? "error" : post.channelRef === "#approvals" ? "pending" : "info",
      actor: post.provider,
      channel: post.channelRef,
      action: post.kind,
      message: post.text
    });
  }

  const sorted = entries
    .filter((e) => e.ts)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, limit);

  const counts = sorted.reduce((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});

  return {
    workspaceId: wsId,
    generatedAt: nowIso(),
    total: entries.length,
    returned: sorted.length,
    counts,
    entries: sorted
  };
}

// --- workstream projection (AI company simulator) ---------------------------
//
// projectWorkstream turns raw platform state into a human-facing "company
// operations" view: a narrative stream of agent work + report beats, mission
// cards with progress, gamified KPIs (company health / automation level /
// agent energy), daily objectives, achievement badges, incident & approval
// alerts, and topology/lane maps. It is a PURE derivation of state — the same
// state always yields the same projection (no Date.now/Math.random), so it is
// safe in the stateless cloud demo. The raw /live-log stays available for the
// technical drawer; this is what the simulator cockpit renders on the surface.

// Business lanes the simulator visualises. Agents/missions map onto a lane via
// task category first, then role keywords as a fallback.
const WORKSTREAM_LANES = Object.freeze([
  { id: "production", label: "생산", category: "production", glyph: "▣", roleHint: /생산|produc/i, reward: "납기 리스크 ↓" },
  { id: "sales", label: "영업", category: "sales", glyph: "◆", roleHint: /영업|sales/i, reward: "수주 가능성 ↑" },
  { id: "scope3", label: "Scope 3", category: "scope3", glyph: "❖", roleHint: /탄소|scope|esg/i, reward: "데이터 누락 ↓" },
  { id: "control", label: "관제", category: "control", glyph: "◈", roleHint: /승인|감사|ops|control/i, reward: "감사 추적 100%" }
]);

function laneForCategory(category) {
  return WORKSTREAM_LANES.find((l) => l.id === category) ?? WORKSTREAM_LANES[3];
}
function laneForAgent(agent, tasks) {
  const owned = tasks.find((t) => (t.assignedAgentId ?? t.ownerAgentId) === agent.id);
  if (owned?.category) return laneForCategory(owned.category);
  return WORKSTREAM_LANES.find((l) => l.roleHint.test(`${agent.role ?? ""} ${agent.name ?? ""}`)) ?? WORKSTREAM_LANES[3];
}

// Deterministic 0..1 hash of a string — used to give sparklines/energy a little
// organic variation without any RNG (keeps the projection pure/replayable).
function seedHash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}
// A small ascending-ish sparkline series derived from a seed + target value.
function sparkSeries(seed, target, n = 12) {
  const base = seedHash(seed);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const wobble = seedHash(`${seed}:${i}`) - 0.5;
    const ramp = (i / (n - 1)) * target;
    out.push(Math.max(0, Math.round((ramp * 0.7 + target * 0.3 * base) + wobble * target * 0.18)));
  }
  out[n - 1] = target;
  return out;
}

const MISSION_PROGRESS = Object.freeze({
  queued: 8, running: 56, waiting_approval: 78, completed: 100, failed: 100
});
const MISSION_LEVEL = Object.freeze({
  queued: "info", running: "running", waiting_approval: "pending", completed: "success", failed: "error"
});
const AGENT_ENERGY = Object.freeze({ running: 90, idle: 74, blocked: 32, disabled: 8 });

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function projectWorkstream(state, workspaceId, { streamLimit = 40 } = {}) {
  const wsId = workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : workspaceId;
  const inWs = (item) => !item.workspaceId || item.workspaceId === wsId;
  const tasks = (state.tasks ?? []).filter(inWs);
  const agents = (state.agents ?? []).filter(inWs);
  const approvals = (state.approvals ?? []).filter(inWs);
  const taskRuns = (state.taskRuns ?? []).filter(inWs);
  const agentById = (id) => agents.find((a) => a.id === id);
  const agentName = (id) => agentById(id)?.name ?? id ?? "agent";
  const taskById = (id) => tasks.find((t) => t.id === id);

  const m = deriveMetrics(state);
  const totalTasks = tasks.length || 1;
  const completed = tasks.filter((t) => t.status === TaskStatus.completed).length;
  const failed = tasks.filter((t) => t.status === TaskStatus.failed).length;
  const pendingApprovals = approvals.filter((a) => a.status === ApprovalStatus.pending).length;
  const blockedAgents = agents.filter((a) => a.status === AgentStatus.blocked).length;
  const runningTasks = tasks.filter((t) => t.status === TaskStatus.running).length;

  // --- gamified company vitals ---
  const healthDelta = completed * 6 - failed * 11 - pendingApprovals * 4 - blockedAgents * 7;
  const healthScore = clamp(Math.round(64 + healthDelta), 5, 100);
  const automationLevel = clamp(Math.round((completed / totalTasks) * 100), 0, 100);
  const tierThresholds = [
    [0, "Seed"], [1, "Operational"], [3, "Scaling"], [5, "Autonomous"]
  ];
  const tier = tierThresholds.reduce((acc, [n, label]) => (completed >= n ? label : acc), "Seed");

  // --- KPI cards (score-like deltas + sparkline) ---
  const baseKpis = [
    { id: "health", label: "Company Health", value: healthScore, unit: "", delta: healthDelta, target: healthScore },
    { id: "automation", label: "Automation Level", value: automationLevel, unit: "%", delta: completed * 8, target: Math.max(automationLevel, 8) },
    { id: "throughput", label: "Missions Cleared", value: completed, unit: "", delta: completed, target: Math.max(completed, 3) },
    { id: "approvals", label: "Approval Queue", value: pendingApprovals, unit: "", delta: -pendingApprovals, target: Math.max(pendingApprovals, 2) }
  ];
  const kpis = baseKpis.map((k) => ({
    ...k,
    trend: k.delta > 0 ? "up" : k.delta < 0 ? "down" : "flat",
    spark: sparkSeries(k.id, k.target)
  }));
  // Domain KPIs carried from the seeded edition (manufacturing).
  const domainKpis = (m.manufacturingKpis ?? []).map((k, i) => ({
    id: `dom_${i}`, label: k.label, value: k.value, delta: k.trend, trend: "flat",
    spark: sparkSeries(`dom_${k.label}`, 6 + i * 2)
  }));

  // --- missions (tasks as mission cards) ---
  const missions = tasks.map((t) => {
    const lane = laneForCategory(t.category);
    const status = t.status ?? "queued";
    return {
      id: t.id, taskId: t.id, title: t.title,
      lane: lane.id, laneLabel: lane.label, laneGlyph: lane.glyph,
      agentId: t.assignedAgentId ?? t.ownerAgentId,
      agent: agentName(t.assignedAgentId ?? t.ownerAgentId),
      status, level: MISSION_LEVEL[status] ?? "info",
      progress: MISSION_PROGRESS[status] ?? 8,
      priority: t.priority ?? "normal",
      requiresApproval: !!t.requiresApproval,
      reward: lane.reward,
      summary: t.output || t.expectedOutput || "",
      runnable: status === "queued" || status === "running"
    };
  });

  // --- agents as "employees" with energy/focus ---
  const agentCards = agents.map((a) => {
    const lane = laneForAgent(a, tasks);
    const status = a.status ?? "idle";
    const active = missions.find((mm) => mm.agentId === a.id && (mm.status === "running" || mm.status === "waiting_approval"));
    const energy = clamp((AGENT_ENERGY[status] ?? 60) + Math.round((seedHash(a.id) - 0.5) * 10), 5, 100);
    return {
      id: a.id, name: a.name, role: a.role ?? "", channel: a.channel ?? "",
      lane: lane.id, laneLabel: lane.label,
      status, energy,
      focus: status === "running" ? "집중 실행" : status === "blocked" ? "정책 차단" : status === "disabled" ? "비활성" : "대기·준비",
      activeMission: active?.title ?? null,
      capabilities: a.capabilities ?? [],
      kpi: a.kpi ?? ""
    };
  });

  // --- topology lanes (mini-map) ---
  const lanes = WORKSTREAM_LANES.map((lane) => {
    const laneMissions = missions.filter((mm) => mm.lane === lane.id);
    const laneAgents = agentCards.filter((a) => a.lane === lane.id);
    const active = laneMissions.filter((mm) => mm.status === "running" || mm.status === "waiting_approval").length;
    const laneDone = laneMissions.filter((mm) => mm.status === "completed").length;
    const laneFailed = laneMissions.filter((mm) => mm.status === "failed").length;
    return {
      id: lane.id, label: lane.label, glyph: lane.glyph,
      agentId: laneAgents[0]?.id ?? null,
      agentName: laneAgents[0]?.name ?? "—",
      missionCount: laneMissions.length,
      load: clamp(Math.round((active / Math.max(1, laneMissions.length)) * 100), 0, 100),
      status: laneFailed ? "error" : active ? "running" : laneDone === laneMissions.length && laneMissions.length ? "success" : "idle",
      done: laneDone, total: laneMissions.length
    };
  });

  // --- daily objectives ---
  const objCount = (cat) => tasks.filter((t) => t.category === cat);
  const objDone = (cat) => objCount(cat).filter((t) => t.status === TaskStatus.completed).length;
  const objectives = [
    { id: "obj_prod", label: "생산 납기 리스크 미션 처리", done: objDone("production"), total: Math.max(1, objCount("production").length) },
    { id: "obj_sales", label: "영업 후속 메시지 승인 통과", done: approvals.filter((a) => a.status === ApprovalStatus.approved).length, total: Math.max(1, objCount("sales").length) },
    { id: "obj_scope3", label: "Scope 3 협력사 데이터 확보", done: objDone("scope3"), total: Math.max(1, objCount("scope3").length) },
    { id: "obj_zero", label: "인시던트 없이 운영 유지", done: failed === 0 ? 1 : 0, total: 1 }
  ].map((o) => ({ ...o, status: o.done >= o.total ? "done" : o.done > 0 ? "progress" : "open" }));

  // --- alerts (incident / approval) ---
  const alerts = [];
  for (const a of approvals.filter((x) => x.status === ApprovalStatus.pending)) {
    alerts.push({ id: `al_${a.id}`, kind: "approval", severity: "warn",
      title: a.title || "승인 필요", message: a.summary || a.reason || "외부 영향 작업 승인 대기",
      approvalId: a.id, taskId: a.taskId });
  }
  for (const t of tasks.filter((x) => x.status === TaskStatus.failed)) {
    alerts.push({ id: `al_${t.id}`, kind: "incident", severity: "high",
      title: `${t.title} 실패`, message: "미션이 반려/실패 처리됨. 재실행 또는 재검토 필요.", taskId: t.id });
  }
  for (const a of agents.filter((x) => x.status === AgentStatus.blocked)) {
    alerts.push({ id: `al_${a.id}`, kind: "incident", severity: "warn",
      title: `${a.name} 정책 차단`, message: "권한 부족으로 실행이 차단됨.", agentId: a.id });
  }

  // --- achievement badges (unlock-style) ---
  const anyApproved = approvals.some((a) => a.status === ApprovalStatus.approved);
  const scope3Done = tasks.some((t) => t.category === "scope3" && t.status === TaskStatus.completed);
  const achievements = [
    { id: "first_run", icon: "⚡", label: "First Dispatch", desc: "첫 미션 실행", unlocked: taskRuns.length > 0 },
    { id: "approval_cleared", icon: "✓", label: "Cleared Gate", desc: "승인 게이트 통과", unlocked: anyApproved },
    { id: "zero_incident", icon: "❖", label: "Zero Incident", desc: "실패 0건 유지", unlocked: failed === 0 && taskRuns.length > 0 },
    { id: "scope3_closer", icon: "♻", label: "Scope 3 Closer", desc: "탄소 데이터 미션 완료", unlocked: scope3Done },
    { id: "full_auto", icon: "★", label: "Full Automation", desc: "모든 미션 완료", unlocked: completed >= tasks.length && tasks.length > 0 }
  ];

  // --- narrative operations stream (human-readable beats) ---
  const beats = [];
  for (const run of taskRuns) {
    const task = taskById(run.taskId);
    const lane = laneForCategory(task?.category);
    beats.push({
      id: `${run.id}:beat-start`, ts: run.startedAt, kind: "mission", level: "running",
      lane: lane.id, laneLabel: lane.label, actor: agentName(run.agentId),
      title: `${agentName(run.agentId)} · ${task?.title ?? "미션"} 착수`,
      detail: `${lane.label} 라인에서 데이터를 점검하고 실행을 시작했습니다.`, reward: null
    });
    if (run.resultSummary) {
      const lvl = run.status === "failed" ? "error" : run.status === "waiting_approval" ? "pending" : "success";
      beats.push({
        id: `${run.id}:beat-report`, ts: run.completedAt ?? run.startedAt,
        kind: lvl === "pending" ? "approval" : "report", level: lvl,
        lane: lane.id, laneLabel: lane.label, actor: agentName(run.agentId),
        title: lvl === "pending" ? `${agentName(run.agentId)} · 승인 요청 보고` : `${agentName(run.agentId)} · 결과 보고`,
        detail: run.resultSummary,
        reward: lvl === "success" ? lane.reward : null
      });
    }
  }
  for (const a of approvals) {
    if (a.decidedAt) {
      const ok = a.status === ApprovalStatus.approved;
      beats.push({
        id: `${a.id}:beat-decided`, ts: a.decidedAt, kind: "decision", level: ok ? "success" : "error",
        lane: laneForCategory(taskById(a.taskId)?.category).id, laneLabel: laneForCategory(taskById(a.taskId)?.category).label,
        actor: a.decidedByUserId || "operator",
        title: `결재 ${ok ? "승인" : "반려"} · ${a.title ?? ""}`,
        detail: ok ? "운영자가 외부 영향 작업을 승인했습니다." : "운영자가 작업을 반려했습니다.",
        reward: null
      });
    }
  }
  // System genesis beat from the seed audit row, so a fresh company isn't empty.
  const seedAudit = (state.auditEvents ?? []).find((e) => e.action === "demo.seed");
  if (seedAudit) {
    beats.push({
      id: `${seedAudit.id}:beat`, ts: seedAudit.ts ?? seedAudit.createdAt, kind: "system", level: "info",
      lane: "control", laneLabel: "관제", actor: "Mission Control",
      title: "회사 운영 시작", detail: "에이전트 조직이 배치되고 미션 보드가 준비되었습니다.", reward: null
    });
  }
  const stream = beats
    .filter((b) => b.ts)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, streamLimit);

  const headline = stream[0]
    ? { title: stream[0].title, detail: stream[0].detail, level: stream[0].level, ts: stream[0].ts }
    : { title: "운영 대기 중", detail: "Seed로 회사를 구성하거나 미션을 실행하세요.", level: "info", ts: null };

  return {
    workspaceId: wsId,
    generatedAt: nowIso(),
    company: {
      name: state.tenant?.name ?? "Company",
      edition: state.tenant?.edition ?? state.workspace?.editionId ?? "platform",
      workspace: state.workspace?.name ?? "Workspace",
      healthScore, healthDelta, automationLevel, tier,
      activeAgents: m.activeAgents, runningTasks, completed, failed, pendingApprovals
    },
    headline,
    kpis, domainKpis,
    missions, agents: agentCards, lanes,
    pipeline: {
      stages: [
        { id: "queued", label: "Queued", count: tasks.filter((t) => t.status === "queued").length },
        { id: "running", label: "Running", count: runningTasks },
        { id: "waiting_approval", label: "Approval", count: tasks.filter((t) => t.status === "waiting_approval").length },
        { id: "completed", label: "Done", count: completed }
      ]
    },
    objectives, alerts, achievements, stream,
    counts: { missions: missions.length, agents: agentCards.length, alerts: alerts.length, stream: stream.length }
  };
}

// --- backward-compatible wrappers (used by older callers / /state) ----------

export function runTask(state, taskId, requestedBy = "operator", options = {}) {
  return dispatch(state, { type: CommandType.taskRun, taskId, requestedBy }, options).result;
}

export function approveRequest(state, approvalId, approver = "operator", options = {}) {
  return dispatch(state, { type: CommandType.approvalDecide, approvalId, decision: "approved", decidedBy: approver }, options).result.approval;
}
