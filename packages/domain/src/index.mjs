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
  "external.message.send",
  "email.send",
  "github.issue.create",
  "github.pr.create",
  "mattermost.thread.post",
  "paperclip.run.start"
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

// Department lanes an agent can belong to in the 3D office. Mirrors the
// front-end LaneId union and the workstream projection's WORKSTREAM_LANES.
export const OFFICE_LANES = Object.freeze(["engineering", "legal", "operations", "control"]);

// Public-safe persona/prompt scaffolding for a role. Used to seed demo staff and
// as the default template when an operator creates a new agent from the office.
// NEVER embed secrets, private paths, vendor or model names here: a persona is a
// description of *intent and behaviour*, not of any underlying provider.
const LANE_PERSONA = Object.freeze({
  engineering: "개발·시스템 업무를 책임지는 동료입니다. GitHub 이슈/PR/테스트/배포 신호를 읽고 안전한 변경 계획을 세웁니다.",
  legal: "계약·정책·컴플라이언스 업무를 책임지는 동료입니다. 문서 리스크를 검토하고 외부 전달 전 승인을 요청합니다.",
  operations: "운영·고객지원·인시던트 업무를 책임지는 동료입니다. 채팅/런북/상태 신호를 읽고 다음 조치를 정리합니다.",
  control: "관제·승인·감사 라인을 책임지는 동료입니다. 권한 정책, 승인 큐, 실행 추적을 관리합니다."
});

export function buildAgentPrompt({ role = "", lane = "control" } = {}) {
  const laneLine = LANE_PERSONA[lane] ?? LANE_PERSONA.control;
  return [
    `당신은 "${role || "팀 동료"}" 역할의 AI 직원입니다.`,
    laneLine,
    "원칙: ① 사실 위에 행동하고 결과를 간결히 보고합니다. ② 외부에 영향을 주는 작업은 반드시 승인을 요청합니다. ③ 비밀·자격증명·내부 경로는 절대 노출하지 않습니다."
  ].join(" ");
}

export function buildAgentPersona({ role = "", lane = "control" } = {}) {
  return LANE_PERSONA[lane] ?? `${role || "팀 동료"} 역할의 AI 직원입니다.`;
}

// --- Role template catalog --------------------------------------------------
// Public-safe hiring presets surfaced to the office "직원 생성" flow. Each
// template proposes a role, lane, KPI and a set of NON-sensitive capability
// labels plus a generated persona/prompt PREVIEW so an operator can read exactly
// what the new colleague will be before creating it. Capabilities here are
// descriptive skill labels only — never capability GRANTS — so a templated hire
// still starts with no sensitive permissions (policy keeps blocking until an
// operator grants them in a later governance flow). Never embed secrets,
// private paths, credentials, vendor or model names in a template.
const ROLE_TEMPLATE_DEFS = Object.freeze([
  { id: "tpl_engineering_triage", lane: "engineering", label: "GitHub PR/이슈 담당", role: "Engineering Operator",
    capabilities: ["GitHub 이슈 triage", "PR 리뷰 계획", "테스트 결과 요약"], kpi: "개발 업무 리드타임 단축" },
  { id: "tpl_legal_reviewer", lane: "legal", label: "계약·정책 검토 담당", role: "Legal Reviewer",
    capabilities: ["계약서 위험 조항 검토", "정책 체크리스트", "승인 메모 작성"], kpi: "문서 검토 누락률 감소" },
  { id: "tpl_operations_controller", lane: "operations", label: "운영·고객지원 담당", role: "Operations Controller",
    capabilities: ["Mattermost 요청 정리", "인시던트 런북", "고객 응답 초안"], kpi: "운영 응답 시간 단축" },
  { id: "tpl_control_ops", lane: "control", label: "관제·승인 담당", role: "Governance Controller",
    capabilities: ["권한 정책 점검", "승인 큐 관리", "감사 로그 정리"], kpi: "외부 영향 작업 승인 추적 유지" }
]);

// Expand a template definition into a full, render-ready preset including the
// public-safe persona + prompt preview text the UI shows before creation.
export function expandRoleTemplate(def) {
  return {
    id: def.id,
    lane: def.lane,
    label: def.label,
    role: def.role,
    capabilities: def.capabilities.slice(),
    kpi: def.kpi,
    persona: buildAgentPersona({ role: def.role, lane: def.lane }),
    promptPreview: buildAgentPrompt({ role: def.role, lane: def.lane })
  };
}

export function listRoleTemplates() {
  return ROLE_TEMPLATE_DEFS.map(expandRoleTemplate);
}

export function getRoleTemplate(id) {
  const def = ROLE_TEMPLATE_DEFS.find((t) => t.id === id);
  return def ? expandRoleTemplate(def) : null;
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
    id: "tenant_bindery_platform_demo",
    name: "BINDERY Box Platform Demo",
    slug: "bindery-platform-demo",
    productName: "BINDERY BOX",
    edition: "platform",
    brandColor: "#111827",
    generatedAt
  });

  const workspace = createWorkspace({
    id: "ws_default",
    tenantId: tenant.id,
    name: "AI Company Office",
    slug: "default",
    editionId: "platform",
    officeRef: "team_platform"
  });

  const agents = [
    createAgentInstance({
      id: "agent_engineering_operator",
      workspaceId: workspace.id,
      definitionId: "def_engineering_operator",
      name: "Engineering Operator",
      role: "개발 업무 담당",
      channel: "#engineering",
      lane: "engineering",
      officeIdentityRef: "bot_engineering",
      capabilityGrants: ["github.repo.read", "github.pr.review", "paperclip.ticket.create"],
      capabilities: ["GitHub 이슈 triage", "PR 리뷰 계획", "테스트 결과 요약"],
      persona: buildAgentPersona({ role: "개발 업무 담당", lane: "engineering" }),
      prompt: buildAgentPrompt({ role: "개발 업무 담당", lane: "engineering" }),
      kpi: "개발 업무 리드타임 50% 단축"
    }),
    createAgentInstance({
      id: "agent_legal_reviewer",
      workspaceId: workspace.id,
      definitionId: "def_legal_reviewer",
      name: "Legal Reviewer",
      role: "계약·정책 검토 담당",
      channel: "#legal",
      lane: "legal",
      officeIdentityRef: "bot_legal",
      capabilityGrants: ["files.read", "policy.review"],
      capabilities: ["계약서 위험 조항 검토", "승인 메모 작성", "정책 체크리스트"],
      persona: buildAgentPersona({ role: "계약·정책 검토 담당", lane: "legal" }),
      prompt: buildAgentPrompt({ role: "계약·정책 검토 담당", lane: "legal" }),
      kpi: "계약 검토 누락률 70% 감소"
    }),
    createAgentInstance({
      id: "agent_operations_controller",
      workspaceId: workspace.id,
      definitionId: "def_operations_controller",
      name: "Operations Controller",
      role: "운영·고객지원 담당",
      channel: "#operations",
      lane: "operations",
      officeIdentityRef: "bot_operations",
      capabilityGrants: ["mattermost.thread.read", "runbook.read", "mattermost.thread.post"],
      capabilities: ["Mattermost 요청 정리", "인시던트 런북", "고객 응답 초안"],
      persona: buildAgentPersona({ role: "운영·고객지원 담당", lane: "operations" }),
      prompt: buildAgentPrompt({ role: "운영·고객지원 담당", lane: "operations" }),
      kpi: "운영 응답 시간 60% 단축"
    }),
    createAgentInstance({
      id: "agent_governance_controller",
      workspaceId: workspace.id,
      definitionId: "def_governance_controller",
      name: "Governance Controller",
      role: "승인·감사 관리자",
      channel: "#approvals",
      lane: "control",
      officeIdentityRef: "bot_control",
      capabilityGrants: ["approval.manage", "audit.read"],
      capabilities: ["권한 정책", "승인 큐", "감사 로그"],
      persona: buildAgentPersona({ role: "승인·감사 관리자", lane: "control" }),
      prompt: buildAgentPrompt({ role: "승인·감사 관리자", lane: "control" }),
      kpi: "외부 영향 작업 100% 승인 추적"
    })
  ];

  const tasks = [
    createTask({
      id: "task_github_triage",
      workspaceId: workspace.id,
      title: "GitHub 이슈와 PR 상태 triage",
      assignedAgentId: "agent_engineering_operator",
      ownerAgentId: "agent_engineering_operator",
      priority: "high",
      category: "engineering",
      lane: "engineering",
      requiredCapabilities: ["github.repo.read", "github.pr.review"],
      requiresApproval: false,
      source: "github:mupengi-bot/bindery-box",
      expectedOutput: "이슈/PR 우선순위 + 다음 액션"
    }),
    createTask({
      id: "task_contract_review",
      workspaceId: workspace.id,
      title: "계약서 위험 조항 검토 보고서 작성",
      assignedAgentId: "agent_legal_reviewer",
      ownerAgentId: "agent_legal_reviewer",
      priority: "normal",
      category: "legal",
      lane: "legal",
      requiredCapabilities: ["files.read", "policy.review"],
      requiresApproval: true,
      source: "mattermost:#legal/thread-contract-review",
      expectedOutput: "위험 조항 표 + 수정 제안 + 승인 메모"
    }),
    createTask({
      id: "task_ops_incident",
      workspaceId: workspace.id,
      title: "Mattermost 운영 인시던트 요청 정리",
      assignedAgentId: "agent_operations_controller",
      ownerAgentId: "agent_operations_controller",
      priority: "high",
      category: "operations",
      lane: "operations",
      requiredCapabilities: ["mattermost.thread.read", "runbook.read"],
      requiresApproval: false,
      source: "mattermost:#operations/thread-incident",
      expectedOutput: "인시던트 요약 + 런북 다음 조치"
    })
  ];

  return {
    schemaVersion: 3,
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
    threads: [],
    artifacts: [],
    orchestratorRuns: [],
    auditEvents: [
      createAuditEvent({
        ts: generatedAt,
        actorType: "system",
        actor: "system",
        action: "workspace.seed",
        target: tenant.id,
        message: "범용 AI Company Office 워크스페이스가 생성됨"
      })
    ],
    metrics: {
      workflowKpis: [
        { label: "GitHub triage", value: "1건", trend: "+1" },
        { label: "승인 대기 문서", value: "1건", trend: "+1" },
        { label: "Mattermost 인입", value: "1건", trend: "+1" }
      ]
    }
  };
}
