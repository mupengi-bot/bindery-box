import { ApprovalStatus, TaskStatus, makeId, nowIso, createDemoState } from "../../core/src/index.mjs";

export function seedDemoState() { return createDemoState(); }

export function deriveMetrics(state) {
  return {
    activeAgents: state.agents.filter((agent) => agent.status !== "offline").length,
    queuedTasks: state.tasks.filter((task) => task.status === TaskStatus.queued).length,
    runningTasks: state.tasks.filter((task) => task.status === TaskStatus.running).length,
    pendingApprovals: state.approvals.filter((approval) => approval.status === ApprovalStatus.pending).length,
    completedTasks: state.tasks.filter((task) => task.status === TaskStatus.completed).length,
    manufacturingKpis: state.metrics?.manufacturingKpis ?? []
  };
}

function appendAudit(state, actor, action, target, message) {
  state.auditEvents.unshift({ id: makeId("audit"), ts: nowIso(), actor, action, target, message });
}

function taskOutput(task) {
  if (task.category === "production") return "생산 2라인 지연 가능성 높음. 원인: 원자재 입고 지연·설비 점검 대기. 권장 조치: 구매팀 확인, 야간조 증원 검토.";
  if (task.category === "sales") return "고객 A/B/C에 대한 후속 메시지 초안 작성 완료. 외부 발송 전 관리자 승인이 필요함.";
  if (task.category === "scope3") return "공급사 4곳의 배출계수·전력사용량 데이터가 누락됨. 자료 요청 메일 초안 생성 완료.";
  return "업무 실행 결과 초안 생성 완료.";
}

export function runTask(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const agent = state.agents.find((item) => item.id === task.ownerAgentId);
  if (!agent) throw new Error(`Agent not found: ${task.ownerAgentId}`);
  agent.status = "working";
  task.status = TaskStatus.running;
  task.startedAt = nowIso();
  appendAudit(state, agent.name, "task.run.started", task.id, `${task.title} 실행 시작`);

  task.output = taskOutput(task);
  task.completedAt = nowIso();
  agent.status = "idle";

  if (task.requiresApproval) {
    task.status = TaskStatus.waitingApproval;
    const approval = {
      id: makeId("approval"),
      taskId: task.id,
      title: `${task.title} 승인 요청`,
      status: ApprovalStatus.pending,
      requestedBy: agent.id,
      requestedAt: nowIso(),
      summary: task.output
    };
    state.approvals.unshift(approval);
    appendAudit(state, agent.name, "approval.requested", approval.id, `${task.title} 승인 요청 생성`);
    return { task, approval };
  }

  task.status = TaskStatus.completed;
  appendAudit(state, agent.name, "task.completed", task.id, task.output);
  return { task };
}

export function approveRequest(state, approvalId, approver = "operator") {
  const approval = state.approvals.find((item) => item.id === approvalId);
  if (!approval) throw new Error(`Approval not found: ${approvalId}`);
  approval.status = ApprovalStatus.approved;
  approval.decidedAt = nowIso();
  approval.approver = approver;
  const task = state.tasks.find((item) => item.id === approval.taskId);
  if (task) task.status = TaskStatus.completed;
  appendAudit(state, approver, "approval.approved", approval.id, `${approval.title} 승인 완료`);
  return approval;
}
