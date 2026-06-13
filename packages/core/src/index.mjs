export const AgentStatus = Object.freeze({ idle: "idle", working: "working", blocked: "blocked", offline: "offline" });
export const TaskStatus = Object.freeze({ queued: "queued", running: "running", waitingApproval: "waiting_approval", completed: "completed" });
export const ApprovalStatus = Object.freeze({ pending: "pending", approved: "approved", rejected: "rejected" });

export function nowIso() { return new Date().toISOString(); }
export function makeId(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`; }

export function createDemoState() {
  const generatedAt = nowIso();
  const tenant = {
    id: "tenant_mufi_manufacturing_demo",
    name: "MUFI Manufacturing Demo",
    productName: "BINDERY BOX Manufacturing",
    edition: "manufacturing",
    brandColor: "#111827",
    generatedAt
  };
  const agents = [
    {
      id: "agent_production_leader",
      name: "Production Leader",
      role: "생산 리더",
      channel: "#production",
      status: AgentStatus.idle,
      capabilities: ["생산일보 요약", "납기 위험 탐지", "비가동 원인 정리"],
      kpi: "납기 위험 알림 시간 70% 단축"
    },
    {
      id: "agent_sales_leader",
      name: "Sales Leader",
      role: "영업 리더",
      channel: "#sales",
      status: AgentStatus.idle,
      capabilities: ["견적 후속 조치", "고객 응답 초안", "수주 가능성 요약"],
      kpi: "견적 응답 리드타임 50% 단축"
    },
    {
      id: "agent_scope3_leader",
      name: "Scope 3 Leader",
      role: "공급망 탄소 대응 리더",
      channel: "#scope3",
      status: AgentStatus.idle,
      capabilities: ["협력사 데이터 누락 탐지", "탄소 자료 요청 초안", "고객 ESG 대응"],
      kpi: "탄소 데이터 누락률 80% 감소"
    },
    {
      id: "agent_ops_controller",
      name: "Ops Controller",
      role: "승인·감사 관리자",
      channel: "#approvals",
      status: AgentStatus.idle,
      capabilities: ["권한 정책", "승인 큐", "감사 로그"],
      kpi: "외부 발송 100% 승인 추적"
    }
  ];
  const tasks = [
    {
      id: "task_production_risk",
      title: "오늘 생산일보 기반 납기 위험 3건 요약",
      ownerAgentId: "agent_production_leader",
      status: TaskStatus.queued,
      priority: "high",
      category: "production",
      requiresApproval: false,
      source: "examples/manufacturing-demo/data/production_daily.csv",
      expectedOutput: "라인별 위험 요약 + 조치 제안"
    },
    {
      id: "task_sales_followup",
      title: "미응답 견적 고객 후속 메시지 초안 작성",
      ownerAgentId: "agent_sales_leader",
      status: TaskStatus.queued,
      priority: "medium",
      category: "sales",
      requiresApproval: true,
      source: "examples/manufacturing-demo/data/orders.csv",
      expectedOutput: "고객 발송 전 승인 대기 메시지"
    },
    {
      id: "task_scope3_gap",
      title: "Scope 3 협력사 탄소 데이터 누락 목록 생성",
      ownerAgentId: "agent_scope3_leader",
      status: TaskStatus.queued,
      priority: "high",
      category: "scope3",
      requiresApproval: true,
      source: "examples/manufacturing-demo/data/scope3_suppliers.csv",
      expectedOutput: "누락 공급사 목록 + 자료 요청 초안"
    }
  ];
  return {
    tenant,
    agents,
    tasks,
    approvals: [],
    auditEvents: [
      { id: makeId("audit"), ts: generatedAt, actor: "system", action: "demo.seed", target: tenant.id, message: "제조업 데모 테넌트가 생성됨" }
    ],
    metrics: {
      activeAgents: agents.length,
      queuedTasks: tasks.length,
      pendingApprovals: 0,
      manufacturingKpis: [
        { label: "납기 위험 감지", value: "3건", trend: "+3" },
        { label: "견적 후속 대상", value: "5건", trend: "+5" },
        { label: "Scope 3 누락 공급사", value: "4곳", trend: "-" }
      ]
    }
  };
}
