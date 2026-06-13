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

// --- backward-compatible wrappers (used by older callers / /state) ----------

export function runTask(state, taskId, requestedBy = "operator", options = {}) {
  return dispatch(state, { type: CommandType.taskRun, taskId, requestedBy }, options).result;
}

export function approveRequest(state, approvalId, approver = "operator", options = {}) {
  return dispatch(state, { type: CommandType.approvalDecide, approvalId, decision: "approved", decidedBy: approver }, options).result.approval;
}
