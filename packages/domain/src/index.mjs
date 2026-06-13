// @bindery-box/domain
// Canonical platform entities, status enums, id/time helpers, and a
// platform-shaped demo state. This is the migration target for the former
// packages/core demo-only shape (see docs/architecture/domain-model.md).

export const AgentStatus = Object.freeze({
  idle: "idle",
  running: "running",
  blocked: "blocked",
  disabled: "disabled"
});

export const TaskStatus = Object.freeze({
  queued: "queued",
  running: "running",
  waitingApproval: "waiting_approval",
  completed: "completed",
  failed: "failed"
});

export const ApprovalStatus = Object.freeze({
  pending: "pending",
  approved: "approved",
  rejected: "rejected"
});

export const ToolCallStatus = Object.freeze({
  requested: "requested",
  blocked: "blocked",
  pendingApproval: "pending_approval",
  completed: "completed",
  failed: "failed"
});

// Capabilities considered sensitive enough to require human approval by policy.
export const SENSITIVE_CAPABILITIES = Object.freeze([
  "external.customer.send",
  "email.send",
  "github.issue.create",
  "erp.order.write"
]);

export function nowIso() {
  return new Date().toISOString();
}

let counter = 0;
export function makeId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

// --- Entity factories -------------------------------------------------------

export function createTenant(fields) {
  const ts = nowIso();
  return { id: makeId("tenant"), status: "active", createdAt: ts, updatedAt: ts, ...fields };
}

export function createWorkspace(fields) {
  const ts = nowIso();
  return { id: makeId("ws"), status: "active", createdAt: ts, updatedAt: ts, ...fields };
}

export function createAgentInstance(fields) {
  const ts = nowIso();
  return {
    id: makeId("agent"),
    status: AgentStatus.idle,
    capabilityGrants: [],
    createdAt: ts,
    updatedAt: ts,
    ...fields
  };
}

export function createTask(fields) {
  const ts = nowIso();
  return {
    id: makeId("task"),
    status: TaskStatus.queued,
    priority: "normal",
    requiresApproval: false,
    createdAt: ts,
    updatedAt: ts,
    ...fields
  };
}

export function createTaskRun(fields) {
  return { id: makeId("run"), status: TaskStatus.running, startedAt: nowIso(), ...fields };
}

export function createApprovalRequest(fields) {
  return { id: makeId("approval"), status: ApprovalStatus.pending, createdAt: nowIso(), ...fields };
}

export function createAuditEvent(fields) {
  return { id: makeId("audit"), createdAt: nowIso(), ...fields };
}

// --- Platform-shaped demo state --------------------------------------------

export function createDemoState() {
  const generatedAt = nowIso();
  const tenant = createTenant({
    id: "tenant_mufi_manufacturing_demo",
    name: "MUFI Manufacturing Demo",
    slug: "mufi-manufacturing-demo",
    productName: "BINDERY BOX Manufacturing",
    edition: "manufacturing",
    brandColor: "#111827",
    generatedAt
  });

  const workspace = createWorkspace({
    id: "ws_default",
    tenantId: tenant.id,
    name: "Manufacturing Operations",
    slug: "default",
    editionId: "manufacturing",
    officeRef: "team_manufacturing"
  });

  const agents = [
    createAgentInstance({
      id: "agent_production_leader",
      workspaceId: workspace.id,
      definitionId: "def_production_leader",
      name: "Production Leader",
      role: "생산 리더",
      channel: "#production",
      officeIdentityRef: "bot_production",
      capabilityGrants: ["files.read", "mes.production.read"],
      capabilities: ["생산일보 요약", "납기 위험 탐지", "비가동 원인 정리"],
      kpi: "납기 위험 알림 시간 70% 단축"
    }),
    createAgentInstance({
      id: "agent_sales_leader",
      workspaceId: workspace.id,
      definitionId: "def_sales_leader",
      name: "Sales Leader",
      role: "영업 리더",
      channel: "#sales",
      officeIdentityRef: "bot_sales",
      capabilityGrants: ["files.read", "email.draft", "external.customer.send"],
      capabilities: ["견적 후속 조치", "고객 응답 초안", "수주 가능성 요약"],
      kpi: "견적 응답 리드타임 50% 단축"
    }),
    createAgentInstance({
      id: "agent_scope3_leader",
      workspaceId: workspace.id,
      definitionId: "def_scope3_leader",
      name: "Scope 3 Leader",
      role: "공급망 탄소 대응 리더",
      channel: "#scope3",
      officeIdentityRef: "bot_scope3",
      capabilityGrants: ["files.read", "email.draft", "scope3.report.generate", "external.customer.send"],
      capabilities: ["협력사 데이터 누락 탐지", "탄소 자료 요청 초안", "고객 ESG 대응"],
      kpi: "탄소 데이터 누락률 80% 감소"
    }),
    createAgentInstance({
      id: "agent_ops_controller",
      workspaceId: workspace.id,
      definitionId: "def_ops_controller",
      name: "Ops Controller",
      role: "승인·감사 관리자",
      channel: "#approvals",
      officeIdentityRef: "bot_ops",
      capabilityGrants: ["approval.manage", "audit.read"],
      capabilities: ["권한 정책", "승인 큐", "감사 로그"],
      kpi: "외부 발송 100% 승인 추적"
    })
  ];

  const tasks = [
    createTask({
      id: "task_production_risk",
      workspaceId: workspace.id,
      title: "오늘 생산일보 기반 납기 위험 3건 요약",
      assignedAgentId: "agent_production_leader",
      ownerAgentId: "agent_production_leader",
      priority: "high",
      category: "production",
      requiredCapabilities: ["files.read", "mes.production.read"],
      requiresApproval: false,
      source: "examples/manufacturing-demo/data/production_daily.csv",
      expectedOutput: "라인별 위험 요약 + 조치 제안"
    }),
    createTask({
      id: "task_sales_followup",
      workspaceId: workspace.id,
      title: "미응답 견적 고객 후속 메시지 초안 작성",
      assignedAgentId: "agent_sales_leader",
      ownerAgentId: "agent_sales_leader",
      priority: "normal",
      category: "sales",
      requiredCapabilities: ["files.read", "external.customer.send"],
      requiresApproval: true,
      source: "examples/manufacturing-demo/data/orders.csv",
      expectedOutput: "고객 발송 전 승인 대기 메시지"
    }),
    createTask({
      id: "task_scope3_gap",
      workspaceId: workspace.id,
      title: "Scope 3 협력사 탄소 데이터 누락 목록 생성",
      assignedAgentId: "agent_scope3_leader",
      ownerAgentId: "agent_scope3_leader",
      priority: "high",
      category: "scope3",
      requiredCapabilities: ["files.read", "scope3.report.generate", "external.customer.send"],
      requiresApproval: true,
      source: "examples/manufacturing-demo/data/scope3_suppliers.csv",
      expectedOutput: "누락 공급사 목록 + 자료 요청 초안"
    })
  ];

  return {
    schemaVersion: 2,
    tenant,
    workspace,
    workspaces: [workspace],
    agents,
    tasks,
    taskRuns: [],
    toolCalls: [],
    approvals: [],
    events: [],
    officeEvents: [],
    auditEvents: [
      createAuditEvent({
        ts: generatedAt,
        actorType: "system",
        actor: "system",
        action: "demo.seed",
        target: tenant.id,
        message: "제조업 데모 테넌트가 생성됨"
      })
    ],
    metrics: {
      manufacturingKpis: [
        { label: "납기 위험 감지", value: "3건", trend: "+3" },
        { label: "견적 후속 대상", value: "5건", trend: "+5" },
        { label: "Scope 3 누락 공급사", value: "4곳", trend: "-" }
      ]
    }
  };
}
