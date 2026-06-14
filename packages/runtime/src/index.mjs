// @bindery-box/runtime
// Runtime Plane. Every mutating flow follows the platform invariant:
//   Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Project
// (docs/architecture/runtime-events.md, platform-first-architecture.md)
import {
  ApprovalStatus,
  TaskStatus,
  AgentStatus,
  OFFICE_LANES,
  createTask,
  createTaskRun,
  createApprovalRequest,
  createAuditEvent,
  createAgentInstance,
  buildAgentPersona,
  buildAgentPrompt,
  getRoleTemplate,
  makeId,
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
    workflowKpis: state.metrics?.workflowKpis ?? []
  };
}

// --- internal helpers -------------------------------------------------------

function taskResult(task) {
  if (task.category === "engineering") return "GitHub 이슈/PR 상태를 triage했습니다. 권장 조치: 실패한 체크 우선 확인, 변경 범위 요약, PR 생성·병합 전 사람 승인 유지.";
  if (task.category === "legal") return "계약·정책 문서를 검토했습니다. 위험 조항 후보, 수정 제안, 외부 발송 전 승인 메모를 생성했습니다.";
  if (task.category === "operations") return "Mattermost 운영 요청을 정리했습니다. 인시던트 요약, 영향 범위, 런북 기준 다음 조치를 제안했습니다.";
  if (task.category === "control") return "승인 큐와 감사 로그를 점검했습니다. 정책 변경 또는 외부 영향 작업 전 사람 승인 경계를 유지합니다.";
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

// Create a new agent ("hire a colleague") from the office. Public-safe by
// construction: only descriptive identity fields are accepted — persona/prompt
// describe intent and behaviour, never secrets, private paths, vendor or model
// names. New office-created agents receive NO capability grants, so policy still
// blocks any sensitive tool use until an operator grants it explicitly.
function handleAgentCreate(state, command) {
  const c = createCollector(state);
  // A role template (optional) supplies public-safe defaults for lane / role /
  // capabilities / persona / prompt / kpi. Any explicit field on the command
  // still wins, so the operator can tweak a template before hiring.
  const template = command.templateId ? getRoleTemplate(command.templateId) : null;
  const lane = OFFICE_LANES.includes(command.lane)
    ? command.lane
    : (template && OFFICE_LANES.includes(template.lane) ? template.lane : "control");
  const role = String(command.role ?? template?.role ?? "").trim();
  const name = String(command.name ?? "").trim();
  const channelByLane = { engineering: "#engineering", legal: "#legal", operations: "#operations", control: "#approvals" };
  const capabilities = Array.isArray(command.capabilities)
    ? command.capabilities
    : (template?.capabilities ?? []);

  const agent = createAgentInstance({
    workspaceId: state.workspace?.id ?? "ws_default",
    definitionId: template ? `def_${template.id}` : `def_custom_${lane}`,
    name,
    role,
    lane,
    channel: command.channel || channelByLane[lane],
    origin: template ? `office.template:${template.id}` : "office.create",
    capabilityGrants: [], // safe default: no sensitive grants until explicitly granted
    capabilities: capabilities.map((x) => String(x).trim()).filter(Boolean).slice(0, 8),
    persona: String(command.persona ?? template?.persona ?? "").trim() || buildAgentPersona({ role, lane }),
    prompt: String(command.prompt ?? template?.promptPreview ?? "").trim() || buildAgentPrompt({ role, lane }),
    kpi: String(command.kpi ?? template?.kpi ?? "").trim()
  });
  state.agents = state.agents ?? [];
  state.agents.push(agent);

  c.emit(EventType.agentCreated,
    { agentId: agent.id, name: agent.name, role: agent.role, lane: agent.lane, templateId: template?.id ?? null, requestedBy: command.requestedBy },
    { actorType: "human", actor: command.requestedBy ?? "operator", target: agent.id, message: `${agent.name || agent.role} 직원 합류 (${lane})` });

  return { ok: true, decision: "created", events: c.events, result: { agent } };
}

// Route a zone work request to the most appropriate colleague in that lane.
// Prefers a seeded lane leader, then any agent already assigned to the lane,
// then any non-disabled agent. Returns null only if the roster is empty.
function routeAgentForLane(state, lane) {
  const agents = (state.agents ?? []).filter((a) => a.status !== AgentStatus.disabled);
  return agents.find((a) => a.lane === lane && /leader|리더/i.test(`${a.role} ${a.definitionId}`))
    ?? agents.find((a) => a.lane === lane)
    ?? agents[0]
    ?? null;
}

const PLAN_BY_LANE = Object.freeze({
  engineering: {
    data: ["GitHub 이슈", "PR diff", "CI 상태", "리포지토리 컨텍스트"],
    capabilities: ["github.repo.read", "github.pr.review", "paperclip.ticket.create"],
    artifacts: ["이슈/PR triage 표", "변경 영향 요약", "실행·테스트 계획"],
    steps: [
      ["github-read", "GitHub 이슈·PR·CI 상태 조회", "low"],
      ["impact-map", "변경 범위와 실패 원인 후보 정리", "medium"],
      ["paperclip-ticket", "Paperclip 실행 티켓/위임 경계 생성", "medium"],
      ["approval-boundary", "브랜치 push/PR 생성 전 승인 경계 확인", "high"]
    ],
    estimate: 3,
    confidence: 81,
    approval: { required: true, reason: "코드 변경·PR 생성은 저장소에 외부 영향을 줄 수 있음", boundary: "브랜치 push, PR 생성, 이슈 댓글 게시 전" }
  },
  legal: {
    data: ["업로드 문서", "계약/정책 체크리스트", "Mattermost 원문 스레드", "승인 규칙"],
    capabilities: ["files.read", "policy.review", "mattermost.thread.post"],
    artifacts: ["위험 조항 표", "수정 제안", "승인 요청 메모"],
    steps: [
      ["document-read", "문서와 요청 스레드 읽기", "low"],
      ["risk-detect", "위험 조항과 모호한 책임 경계 추출", "medium"],
      ["revision-draft", "수정 제안과 근거 작성", "medium"],
      ["human-gate", "외부 전달 전 승인 요청", "high"]
    ],
    estimate: 4,
    confidence: 77,
    approval: { required: true, reason: "법무/계약 산출물은 외부 전달 전 사람 검토가 필요함", boundary: "외부 발송·서명·고객 공유 전" }
  },
  operations: {
    data: ["Mattermost 채널/스레드", "운영 런북", "서비스 상태", "최근 감사 로그"],
    capabilities: ["mattermost.thread.read", "runbook.read", "mattermost.thread.post"],
    artifacts: ["인시던트 요약", "영향 범위", "다음 액션 체크리스트"],
    steps: [
      ["thread-ingest", "Mattermost 요청과 관련 스레드 수집", "low"],
      ["runbook-match", "런북과 서비스 상태를 대조", "medium"],
      ["next-actions", "담당자·우선순위·다음 액션 정리", "medium"],
      ["thread-reply", "스레드 답변 초안 작성", "medium"]
    ],
    estimate: 3,
    confidence: 80,
    approval: { required: false, reason: "초기 운영 triage는 읽기·초안 중심", boundary: "고객/외부 시스템 변경 또는 공지 발송 전" }
  },
  control: {
    data: ["승인 큐", "감사 로그", "정책 상태", "커넥터 권한"],
    capabilities: ["approval.manage", "audit.read", "policy.review"],
    artifacts: ["승인 병목 요약", "정책 점검표", "감사 메모"],
    steps: [
      ["queue-read", "승인 큐와 감사 로그 조회", "low"],
      ["policy-check", "위험 권한과 지연 원인 점검", "medium"],
      ["recommend", "운영자 조치 추천", "medium"]
    ],
    estimate: 2,
    confidence: 80,
    approval: { required: false, reason: "관제 분석은 읽기 중심", boundary: "정책 변경 또는 권한 부여 전" }
  }
});

function inferLaneFromText(text, fallback = "control") {
  const t = String(text ?? "").toLowerCase();
  if (/(github|git|pr|pull request|issue|commit|branch|ci|test|bug|code|repo|리포|코드|버그|테스트|이슈)/i.test(t)) return "engineering";
  if (/(contract|legal|clause|compliance|policy|계약|법무|조항|컴플라이언스|정책|서명)/i.test(t)) return "legal";
  if (/(mattermost|incident|runbook|ops|operation|customer|support|장애|인시던트|런북|운영|고객|지원|채널|스레드)/i.test(t)) return "operations";
  if (/(approval|audit|governance|permission|승인|감사|권한|거버넌스|관제)/i.test(t)) return "control";
  return OFFICE_LANES.includes(fallback) ? fallback : "control";
}

export function buildPlanPreview(state, command) {
  const lane = inferLaneFromText(command.title, command.lane);
  const spec = PLAN_BY_LANE[lane] ?? PLAN_BY_LANE.control;
  const agent = routeAgentForLane(state, lane);
  const title = String(command.title ?? "").trim() || "새 업무 목표";
  return {
    id: makeId("plan"),
    workspaceId: command.workspaceId ?? state.workspace?.id ?? "ws_default",
    title,
    lane,
    assignedAgentId: agent?.id ?? null,
    assignedAgentName: agent?.name ?? "Unassigned",
    steps: spec.steps.map(([id, label, risk], index) => ({ id, label, risk, index: index + 1 })),
    requiredData: spec.data.slice(),
    requiredCapabilities: spec.capabilities.slice(),
    expectedArtifacts: spec.artifacts.slice(),
    approvals: [spec.approval],
    estimatedMinutes: spec.estimate,
    confidence: spec.confidence,
    requestedBy: command.requestedBy ?? "operator",
    createdAt: nowIso()
  };
}

function handleTaskPlanPreview(state, command) {
  const c = createCollector(state);
  const preview = buildPlanPreview(state, command);
  c.emit(EventType.taskPlanPreviewed,
    { planId: preview.id, workspaceId: preview.workspaceId, title: preview.title, lane: preview.lane, agentId: preview.assignedAgentId, requestedBy: command.requestedBy },
    { actorType: "human", actor: command.requestedBy ?? "operator", target: preview.id, message: `실행 계획 미리보기: ${preview.title}` });
  return { ok: true, decision: "previewed", events: c.events, result: { preview } };
}

// zone.work-request.created -> task.create. Turns a department work request into
// a real queued task, routes it to a lane colleague, and (optionally) enqueues a
// run intent. The task then surfaces as a runnable mission in the workstream
// projection, so the operator can run/enqueue it like any seeded mission.
function handleTaskCreate(state, command) {
  const c = createCollector(state);
  const lane = OFFICE_LANES.includes(command.lane) ? command.lane : "control";
  const agent = routeAgentForLane(state, lane);
  const title = String(command.title ?? "").trim() || "새 업무 요청";
  const requiredCapabilities = Array.isArray(command.requiredCapabilities)
    ? command.requiredCapabilities.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];

  const task = createTask({
    workspaceId: state.workspace?.id ?? "ws_default",
    title,
    category: lane,
    lane,
    priority: ["low", "normal", "high"].includes(command.priority) ? command.priority : "normal",
    requiresApproval: Boolean(command.requiresApproval),
    requiredCapabilities,
    assignedAgentId: agent?.id,
    ownerAgentId: agent?.id,
    origin: "zone.work-request",
    source: "office.zone-request",
    expectedOutput: String(command.expectedOutput ?? "").trim() || "요청 처리 결과 초안"
  });
  state.tasks = state.tasks ?? [];
  state.tasks.push(task);

  c.emit(EventType.taskCreated,
    { taskId: task.id, title: task.title, lane, agentId: agent?.id, requestedBy: command.requestedBy },
    { actorType: "human", actor: command.requestedBy ?? "operator", target: task.id,
      message: `${lane} 구역 업무 요청 생성: ${title}${agent ? ` → ${agent.name}` : ""}` });

  // Optional enqueue intent — records that the work is queued for the routed
  // agent without auto-running it (operator keeps the human-in-the-loop run).
  if (command.enqueue && agent) {
    c.emit(EventType.agentRunQueued,
      { taskId: task.id, agentId: agent.id, goal: title, requestedBy: command.requestedBy },
      { actorType: "human", actor: command.requestedBy ?? "operator", target: task.id,
        message: `${agent.name} 실행 큐에 추가됨` });
  }

  return { ok: true, decision: "created", events: c.events, result: { task, agent } };
}

function ensureCollections(state) {
  state.threads = state.threads ?? [];
  state.artifacts = state.artifacts ?? [];
  state.orchestratorRuns = state.orchestratorRuns ?? [];
}

function handleUserMessageIngest(state, command) {
  const c = createCollector(state);
  ensureCollections(state);
  const workspaceId = command.workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : command.workspaceId;
  const text = String(command.text ?? "").trim();
  const lane = inferLaneFromText(text, command.lane);
  const agent = routeAgentForLane(state, lane);
  const channelRef = String(command.channelRef ?? "#inbox").trim() || "#inbox";
  const threadRef = String(command.threadRef ?? `${channelRef}:${command.providerEventId}`).trim();
  const title = text.length > 80 ? `${text.slice(0, 77)}...` : text || "채팅에서 들어온 업무 요청";

  const thread = {
    id: makeId("thread"), workspaceId, provider: command.provider, channelRef, threadRef,
    senderRef: command.senderRef, providerEventId: command.providerEventId, linkedWorkItemId: null,
    createdAt: nowIso(), lastMessage: text
  };
  state.threads.unshift(thread);

  const task = createTask({
    workspaceId, title, category: lane, lane, priority: "normal", requiresApproval: lane === "engineering" || lane === "legal",
    requiredCapabilities: PLAN_BY_LANE[lane]?.capabilities ?? [], assignedAgentId: agent?.id, ownerAgentId: agent?.id,
    origin: "chat.message", source: `${command.provider}:${channelRef}`, sourceThreadId: thread.id,
    expectedOutput: `${channelRef} 스레드에 반환할 실행 계획과 산출물`
  });
  state.tasks = state.tasks ?? [];
  state.tasks.push(task);
  thread.linkedWorkItemId = task.id;

  const orchestratorRun = {
    id: makeId("orch"), workspaceId, taskId: task.id, provider: "paperclip-boundary", status: "planned",
    externalRef: null, createdAt: nowIso(),
    note: "Mock boundary only: real Paperclip/OpenClaw Gateway credentials are not required for this public-safe loop."
  };
  state.orchestratorRuns.unshift(orchestratorRun);

  c.emit(EventType.userMessageReceived,
    { workspaceId, provider: command.provider, channelRef, threadRef, senderRef: command.senderRef, text, taskId: task.id, lane },
    { actorType: "human", actor: command.senderRef, target: threadRef, message: `${command.provider} 메시지 인입 → ${lane} 업무 생성` });
  c.emit(EventType.taskCreated,
    { taskId: task.id, title: task.title, lane, agentId: agent?.id, requestedBy: command.senderRef, source: command.provider },
    { actorType: "system", actor: "control-plane", target: task.id, message: `채팅 업무 생성: ${title}${agent ? ` → ${agent.name}` : ""}` });
  c.emit(EventType.agentRunQueued,
    { taskId: task.id, agentId: agent?.id, goal: title, requestedBy: command.senderRef, orchestratorRunId: orchestratorRun.id },
    { actorType: "system", actor: "paperclip-boundary", target: orchestratorRun.id, message: `Paperclip 실행 경계 준비: ${title}` });

  return { ok: true, decision: "ingested", events: c.events, result: { thread, task, agent, orchestratorRun } };
}

function handleOfficeMessagePost(state, command) {
  const c = createCollector(state);
  ensureCollections(state);
  const workspaceId = command.workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : command.workspaceId;
  const channelRef = String(command.channelRef ?? "#tasks").trim() || "#tasks";
  const text = String(command.text ?? "").trim();
  const thread = state.threads.find((t) => t.id === command.threadId || t.threadRef === command.threadId || t.threadRef === command.correlationId);
  if (thread) {
    thread.replies = thread.replies ?? [];
    thread.replies.push({ id: makeId("reply"), actor: command.actor ?? "bindery-bot", text, createdAt: nowIso() });
    thread.lastReply = text;
    thread.updatedAt = nowIso();
  }
  const post = {
    id: makeId("office"), provider: command.provider ?? "mattermost-mock", teamRef: "team_platform",
    channelRef, threadRef: thread?.threadRef ?? command.correlationId ?? null, kind: "thread_reply",
    text, sourceEventId: null, sourceEventType: EventType.officeMessagePosted, postedAt: nowIso()
  };
  state.officeEvents = state.officeEvents ?? [];
  state.officeEvents.push(post);
  c.emit(EventType.officeMessagePosted,
    { workspaceId, channelRef, threadRef: post.threadRef, text, correlationId: command.correlationId },
    { actorType: "system", actor: post.provider, target: channelRef, message: text });
  return { ok: true, decision: "posted", events: c.events, result: { post, thread } };
}

function handleAgentRunEnqueue(state, command, policy) {
  const c = createCollector(state);
  ensureCollections(state);
  const workspaceId = command.workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : command.workspaceId;
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (!task) throw new Error(`Task not found: ${command.taskId}`);
  const agent = state.agents.find((a) => a.id === (command.agentId ?? task.assignedAgentId ?? task.ownerAgentId));
  if (!agent) throw new Error(`Agent not found for task: ${command.taskId}`);

  const verdict = policy.evaluateTaskRun(task, agent);
  if (verdict.decision === Decision.block) {
    task.status = TaskStatus.queued;
    agent.status = AgentStatus.blocked;
    c.emit(EventType.toolCallBlocked, { taskId: task.id, agentId: agent.id, reason: verdict.reason },
      { actorType: "system", actor: "policy", target: task.id, message: `Paperclip 실행 차단: ${verdict.reason}` });
    return { ok: false, decision: verdict.decision, events: c.events, result: { task, agent, blocked: verdict } };
  }

  const orchestratorRun = {
    id: makeId("orch"), workspaceId, taskId: task.id, agentId: agent.id, provider: "paperclip-boundary",
    status: verdict.decision === Decision.requireApproval ? "waiting_approval" : "running",
    adapters: ["paperclip", "github", "mattermost"], externalRef: command.externalRef ?? null,
    createdAt: nowIso(), startedAt: verdict.decision === Decision.requireApproval ? null : nowIso(),
    goal: command.goal ?? task.title, policyDecision: verdict.decision, approvalId: null
  };
  state.orchestratorRuns.unshift(orchestratorRun);
  task.lastOrchestratorRunId = orchestratorRun.id;
  c.emit(EventType.agentRunQueued,
    { workspaceId, taskId: task.id, agentId: agent.id, goal: orchestratorRun.goal, orchestratorRunId: orchestratorRun.id, requestedBy: command.requestedBy },
    { actorType: "system", actor: "paperclip-boundary", target: orchestratorRun.id, message: `Paperclip 경계 실행 큐 등록: ${task.title}` });

  if (verdict.decision === Decision.requireApproval) {
    const approval = createApprovalRequest({
      taskId: task.id, taskRunId: orchestratorRun.id, workspaceId, title: `${task.title} 실행 승인 요청`,
      requestedByAgentId: agent.id, reason: verdict.reason, summary: "Paperclip/GitHub/Mattermost 경계 실행 전 사람 승인이 필요합니다."
    });
    state.approvals.unshift(approval);
    task.status = TaskStatus.waitingApproval;
    orchestratorRun.approvalId = approval.id;
    c.emit(EventType.approvalRequested,
      { approvalId: approval.id, workspaceId, taskRunId: orchestratorRun.id, reason: verdict.reason },
      { actorType: "agent", actor: agent.name, target: approval.id, message: `${task.title} 실행 승인 요청 생성` });
    return { ok: true, decision: verdict.decision, events: c.events, result: { task, agent, orchestratorRun, approval } };
  }

  agent.status = AgentStatus.running;
  task.status = TaskStatus.running;
  c.emit(EventType.agentRunStarted,
    { workspaceId, taskId: task.id, agentId: agent.id, orchestratorRunId: orchestratorRun.id, adapter: "paperclip-boundary" },
    { actorType: "agent", actor: agent.name, target: task.id, message: `Paperclip/OpenClaw 경계 실행 시작: ${task.title}` });
  c.emit(EventType.agentStreamDelta,
    { workspaceId, taskId: task.id, agentId: agent.id, orchestratorRunId: orchestratorRun.id, delta: "GitHub/Mattermost context collected; creating operator-facing artifact." });

  const artifact = {
    id: makeId("artifact"), workspaceId, type: "run-report", title: `${task.title} 실행 보고서`,
    contentRef: `artifact://${task.id}/paperclip-boundary-report`, sourceRunId: orchestratorRun.id, visibleInOffice: true,
    createdAt: nowIso(), summary: `${agent.name}가 ${task.title} 업무를 Paperclip/GitHub/Mattermost 경계에서 처리했습니다.`
  };
  state.artifacts.unshift(artifact);
  const resultSummary = `${artifact.summary} 산출물: ${artifact.title}`;
  task.output = resultSummary;
  task.artifactRefs = [...(task.artifactRefs ?? []), artifact.id];
  task.status = TaskStatus.completed;
  agent.status = AgentStatus.idle;
  orchestratorRun.status = "completed";
  orchestratorRun.completedAt = nowIso();
  orchestratorRun.artifactId = artifact.id;
  c.emit(EventType.agentRunCompleted,
    { workspaceId, taskId: task.id, agentId: agent.id, orchestratorRunId: orchestratorRun.id, artifactId: artifact.id, resultSummary },
    { actorType: "agent", actor: agent.name, target: task.id, message: resultSummary });
  c.emit(EventType.taskRunCompleted,
    { taskRunId: orchestratorRun.id, taskId: task.id, resultSummary },
    { actorType: "agent", actor: agent.name, target: task.id, message: resultSummary });
  return { ok: true, decision: verdict.decision, events: c.events, result: { task, agent, orchestratorRun, artifact } };
}

// agent.move.requested lifecycle. Movement is persisted as a real command/event
// flow (not just UI-local): policy authorises the move, the runtime records the
// agent's move target on canonical state, and three events
// (requested -> accepted -> projected) capture the lifecycle so the workstream
// projection can replay the avatar position after a refresh.
function handleAgentMove(state, command, policy) {
  const c = createCollector(state);
  const agent = (state.agents ?? []).find((a) => a.id === command.agentId);

  // 1) Policy check BEFORE mutating canonical state.
  const verdict = (policy.evaluateAgentMove ?? defaultPolicy.evaluateAgentMove)(agent);
  c.emit(EventType.agentMoveRequested,
    { agentId: command.agentId, x: command.x, z: command.z, requestedBy: command.requestedBy });

  if (verdict.decision === Decision.block) {
    c.emit(EventType.toolCallBlocked,
      { agentId: command.agentId, reason: verdict.reason },
      { actorType: "system", actor: "policy", target: command.agentId, message: `이동 차단: ${verdict.reason}` });
    return { ok: false, decision: verdict.decision, events: c.events, result: { blocked: verdict } };
  }

  // 2) Runtime action — persist the move target on the agent.
  const moveTarget = {
    x: Number(command.x) || 0,
    z: Number(command.z) || 0,
    source: command.source === "zone" ? "zone" : "floor",
    issuedAt: nowIso(),
    status: "accepted"
  };
  agent.moveTarget = moveTarget;
  agent.position = { x: moveTarget.x, z: moveTarget.z };
  agent.updatedAt = nowIso();

  // 3) Lifecycle events: accepted (control-plane) -> projected (office surface).
  c.emit(EventType.agentMoveAccepted,
    { agentId: agent.id, x: moveTarget.x, z: moveTarget.z, requestedBy: command.requestedBy },
    { actorType: "human", actor: command.requestedBy ?? "operator", target: agent.id,
      message: `${agent.name} 이동 명령 수락 (${moveTarget.x.toFixed(1)}, ${moveTarget.z.toFixed(1)})` });
  c.emit(EventType.agentMoveProjected,
    { agentId: agent.id, x: moveTarget.x, z: moveTarget.z });

  return { ok: true, decision: verdict.decision, events: c.events, result: { agent, moveTarget } };
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
    case CommandType.taskPlanPreview:
      outcome = handleTaskPlanPreview(state, command);
      break;
    case CommandType.userMessageIngest:
      outcome = handleUserMessageIngest(state, command);
      break;
    case CommandType.agentRunEnqueue:
      outcome = handleAgentRunEnqueue(state, command, policy);
      break;
    case CommandType.officeMessagePost:
      outcome = handleOfficeMessagePost(state, command);
      break;
    case CommandType.taskRun:
      outcome = handleTaskRun(state, command, policy);
      break;
    case CommandType.approvalDecide:
      outcome = handleApprovalDecide(state, command);
      break;
    case CommandType.agentCreate:
      outcome = handleAgentCreate(state, command);
      break;
    case CommandType.taskCreate:
      outcome = handleTaskCreate(state, command);
      break;
    case CommandType.agentMoveRequest:
      outcome = handleAgentMove(state, command, policy);
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
  "task.plan.previewed": { level: "info", label: "실행 계획 미리보기" },
  "user.message.received": { level: "info", label: "채팅 인입" },
  "task.created": { level: "info", label: "업무 생성" },
  "agent.move.requested": { level: "info", label: "이동 요청" },
  "agent.move.accepted": { level: "info", label: "이동 수락" },
  "agent.move.projected": { level: "info", label: "이동 반영" },
  "agent.run.queued": { level: "info", label: "실행 큐 추가" },
  "agent.run.started": { level: "running", label: "에이전트 실행 시작" },
  "agent.stream.delta": { level: "running", label: "에이전트 스트림" },
  "agent.run.completed": { level: "success", label: "에이전트 실행 완료" },
  "agent.run.failed": { level: "error", label: "에이전트 실행 실패" },
  "task.run.started": { level: "running", label: "업무 실행 시작" },
  "task.run.completed": { level: "success", label: "업무 완료" },
  "task.run.failed": { level: "error", label: "업무 실패" },
  "tool.call.requested": { level: "info", label: "툴 호출 요청" },
  "tool.call.blocked": { level: "error", label: "툴 호출 차단" },
  "tool.call.pending-approval": { level: "pending", label: "승인 대기 전환" },
  "tool.call.completed": { level: "success", label: "툴 호출 완료" },
  "approval.requested": { level: "pending", label: "승인 요청" },
  "approval.decided": { level: "info", label: "승인 결정" },
  "agent.created": { level: "success", label: "직원 합류" },
  "office.message.posted": { level: "info", label: "오피스 게시" }
});

function liveEventDetail(event) {
  return event.taskTitle
    || event.title
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
  { id: "engineering", label: "Engineering", category: "engineering", glyph: "⌘", roleHint: /개발|engineering|github|code|pr|issue/i, reward: "개발 리드타임 ↓" },
  { id: "legal", label: "Legal", category: "legal", glyph: "§", roleHint: /계약|법무|legal|compliance|policy/i, reward: "문서 리스크 ↓" },
  { id: "operations", label: "Operations", category: "operations", glyph: "◆", roleHint: /운영|ops|operation|support|incident|mattermost/i, reward: "응답 시간 ↓" },
  { id: "control", label: "Control", category: "control", glyph: "◈", roleHint: /승인|감사|governance|control/i, reward: "감사 추적 100%" }
]);

function laneForCategory(category) {
  return WORKSTREAM_LANES.find((l) => l.id === category) ?? WORKSTREAM_LANES[3];
}
function laneForAgent(agent, tasks) {
  // An explicit lane (seeded staff or office-created agents) always wins so the
  // 3D office places the avatar in the department the operator chose.
  if (agent.lane && WORKSTREAM_LANES.some((l) => l.id === agent.lane)) return laneForCategory(agent.lane);
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
  // Workflow KPIs carried from the seeded workspace template.
  const domainKpis = (m.workflowKpis ?? []).map((k, i) => ({
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
      origin: t.origin ?? "seed",
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
      persona: a.persona ?? "",
      prompt: a.prompt ?? "",
      origin: a.origin ?? "seed",
      kpi: a.kpi ?? "",
      // Persisted office-board placement so a refresh replays the avatar's last
      // commanded move target (agent.move.requested lifecycle).
      position: a.position ?? null,
      moveTarget: a.moveTarget ?? null
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
    { id: "obj_eng", label: "GitHub 이슈/PR triage 처리", done: objDone("engineering"), total: Math.max(1, objCount("engineering").length) },
    { id: "obj_legal", label: "계약·정책 승인 게이트 통과", done: approvals.filter((a) => a.status === ApprovalStatus.approved).length, total: Math.max(1, objCount("legal").length) },
    { id: "obj_ops", label: "Mattermost 인입 업무 정리", done: objDone("operations"), total: Math.max(1, objCount("operations").length) },
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
  const achievements = [
    { id: "first_run", icon: "⚡", label: "First Dispatch", desc: "첫 미션 실행", unlocked: taskRuns.length > 0 },
    { id: "approval_cleared", icon: "✓", label: "Cleared Gate", desc: "승인 게이트 통과", unlocked: anyApproved },
    { id: "zero_incident", icon: "❖", label: "Zero Incident", desc: "실패 0건 유지", unlocked: failed === 0 && taskRuns.length > 0 },
    { id: "thread_ingested", icon: "✉", label: "Thread Ingested", desc: "채팅 요청 업무화", unlocked: (state.threads ?? []).length > 0 },
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
  const seedAudit = (state.auditEvents ?? []).find((e) => e.action === "workspace.seed" || e.action === "demo.seed");
  if (seedAudit) {
    beats.push({
      id: `${seedAudit.id}:beat`, ts: seedAudit.ts ?? seedAudit.createdAt, kind: "system", level: "info",
      lane: "control", laneLabel: "Control", actor: "Mission Control",
      title: "AI Company Office 시작", detail: "범용 팀·채팅·GitHub·Paperclip 경계가 준비되었습니다.", reward: null
    });
  }
  const stream = beats
    .filter((b) => b.ts)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
    .slice(0, streamLimit);

  const headline = stream[0]
    ? { title: stream[0].title, detail: stream[0].detail, level: stream[0].level, ts: stream[0].ts }
    : { title: "운영 대기 중", detail: "Seed로 회사를 구성하거나 미션을 실행하세요.", level: "info", ts: null };

  // --- agent performance market (증권 랭킹 패턴, 업무 성과 용어) --------------
  // Pure derivation. Each agent earns a 업무 성과 점수(score), 변화량(delta) /
  // 변화율(deltaPercent), 처리량(workload/volume), 자동화 비율(automationRatio)
  // vs 사람 개입(humanRatio) split, an AI 요약 line and a 관심(watch) flag.
  // Ranked by score so the UI can render a securities-style 랭킹 보드. No
  // financial/investment vocabulary is used — only 업무 성과/에이전트 실적/자동화.
  const STATUS_LABEL_KO = Object.freeze({
    running: "실행 중", idle: "대기", blocked: "정책 차단", disabled: "비활성"
  });
  const pct1 = (num, den) => Math.round((num / Math.max(1, den)) * 1000) / 10;
  const perfRaw = agentCards.map((a) => {
    const owned = missions.filter((mm) => mm.agentId === a.id);
    const done = owned.filter((mm) => mm.status === "completed").length;
    const active = owned.filter((mm) => mm.status === "running" || mm.status === "waiting_approval").length;
    const failedOwned = owned.filter((mm) => mm.status === "failed").length;
    const autoMissions = owned.filter((mm) => !mm.requiresApproval).length;
    const wob = seedHash(`perf:${a.id}`);

    const score = clamp(Math.round(
      58 + done * 12 + active * 6 - failedOwned * 16 + (a.energy - 60) * 0.18 + (wob - 0.5) * 9
    ), 0, 120);
    const delta = Math.round(done * 6 + active * 2 - failedOwned * 11 + (seedHash(`perfd:${a.id}`) - 0.46) * 7);
    const deltaPercent = pct1(delta, Math.max(1, score - delta));
    const automationRatio = clamp(Math.round(
      owned.length ? (autoMissions / owned.length) * 100 : 60 + (wob - 0.5) * 30
    ), 0, 100);
    const workload = clamp(
      owned.length * 16 + (a.capabilities?.length ?? 0) * 6 + active * 14 + Math.round(wob * 12),
      4, 100
    );
    const summary = a.status === "blocked"
      ? "정책 차단 상태 · 권한 부여 검토 필요"
      : active
        ? `${a.laneLabel} 미션 실행 중 · 처리량 ${workload} 유지`
        : done
          ? `${a.laneLabel} 미션 ${done}건 완료 · 자동화 ${automationRatio}%`
          : `대기 중 · 다음 ${a.laneLabel} 미션 준비`;
    const runnable = owned.find((mm) => mm.runnable);
    return {
      id: a.id, name: a.name, role: a.role, lane: a.lane, laneLabel: a.laneLabel,
      status: a.status, statusLabel: STATUS_LABEL_KO[a.status] ?? a.status,
      score, delta, deltaPercent, trend: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
      automationRatio, humanRatio: 100 - automationRatio,
      workload, volume: workload,
      missionsTotal: owned.length, missionsDone: done, missionsActive: active,
      summary,
      watch: seedHash(`watch:${a.id}`) > 0.4,
      runnableMissionId: runnable?.taskId ?? runnable?.id ?? null,
      spark: sparkSeries(`perf_${a.id}`, Math.max(8, score))
    };
  });
  const agentPerformance = perfRaw
    .slice()
    .sort((p1, p2) => p2.score - p1.score || (p1.name < p2.name ? -1 : 1))
    .map((p, i) => ({ ...p, rank: i + 1 }));

  // 지수 카드 (summary index cards) — composite 성과/자동화/처리량/승인 지표.
  const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
  const perfIndex = Math.round(avg(agentPerformance.map((p) => p.score)));
  const autoIndex = Math.round(avg(agentPerformance.map((p) => p.automationRatio)));
  const perfDeltaAvg = Math.round(avg(agentPerformance.map((p) => p.delta)) * 10) / 10;
  const throughput = completed + runningTasks;
  const marketIndices = [
    { id: "perf", label: "성과 종합 지수", value: perfIndex, unit: "",
      delta: perfDeltaAvg, deltaPercent: pct1(perfDeltaAvg, Math.max(1, perfIndex - perfDeltaAvg)),
      trend: perfDeltaAvg > 0 ? "up" : perfDeltaAvg < 0 ? "down" : "flat",
      spark: sparkSeries("idx_perf", Math.max(8, perfIndex)) },
    { id: "auto", label: "자동화 지수", value: autoIndex, unit: "%",
      delta: completed * 4, deltaPercent: pct1(completed * 4, Math.max(1, autoIndex)),
      trend: completed ? "up" : "flat",
      spark: sparkSeries("idx_auto", Math.max(8, autoIndex)) },
    { id: "throughput", label: "처리량 지수", value: throughput, unit: "건",
      delta: completed, deltaPercent: 0, trend: throughput ? "up" : "flat",
      spark: sparkSeries("idx_thru", Math.max(6, throughput * 3)) },
    { id: "approval", label: "승인 대기", value: pendingApprovals, unit: "건",
      delta: -pendingApprovals, deltaPercent: 0,
      trend: pendingApprovals ? "down" : "flat",
      spark: sparkSeries("idx_appr", Math.max(4, pendingApprovals * 4 + 4)) }
  ];

  // 시장 상태 chip → 운영 상태 + 실시간 기준 시각.
  const marketStatus = failed
    ? { code: "alert", label: "인시던트 점검" }
    : pendingApprovals
      ? { code: "review", label: "승인 점검 중" }
      : runningTasks
        ? { code: "active", label: "운영 가동 중" }
        : completed >= tasks.length && tasks.length
          ? { code: "settled", label: "운영 정산 완료" }
          : { code: "idle", label: "운영 대기" };

  // 카테고리 필터 pill (lanes 중 미션이 있는 것).
  const categories = WORKSTREAM_LANES
    .map((lane) => ({ id: lane.id, label: lane.label, count: missions.filter((mm) => mm.lane === lane.id).length }))
    .filter((c) => c.count > 0);

  // 관심 에이전트 TOP 10 (watchlist) — flagged + score-ranked.
  const watchlist = agentPerformance.filter((p) => p.watch).slice(0, 10);

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
    agentPerformance,
    market: { status: marketStatus, asOf: nowIso(), indices: marketIndices, categories },
    watchlist,
    counts: {
      missions: missions.length, agents: agentCards.length, alerts: alerts.length,
      stream: stream.length, performers: agentPerformance.length, watchlist: watchlist.length
    }
  };
}

// --- backward-compatible wrappers (used by older callers / /state) ----------

export function runTask(state, taskId, requestedBy = "operator", options = {}) {
  return dispatch(state, { type: CommandType.taskRun, taskId, requestedBy }, options).result;
}

export function approveRequest(state, approvalId, approver = "operator", options = {}) {
  return dispatch(state, { type: CommandType.approvalDecide, approvalId, decision: "approved", decidedBy: approver }, options).result.approval;
}
