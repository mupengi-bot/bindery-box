// Typed views of the BINDERY BOX control-plane projections consumed by the
// 3D office surface and its HUD overlays. These mirror the shapes produced by
// packages/runtime (projectWorkstream / projectLiveLog) and the connector +
// knowledge endpoints.

export type AgentStatus = "running" | "idle" | "blocked" | "disabled";
export type LaneId = "engineering" | "legal" | "operations" | "control";

export interface PlanPreview {
  id: string;
  workspaceId: string;
  title: string;
  lane: LaneId;
  assignedAgentId: string | null;
  assignedAgentName: string;
  steps: { id: string; label: string; risk: "low" | "medium" | "high"; index: number }[];
  requiredData: string[];
  requiredCapabilities: string[];
  expectedArtifacts: string[];
  approvals: { required: boolean; reason: string; boundary: string }[];
  estimatedMinutes: number;
  confidence: number;
  requestedBy: string;
  createdAt: string;
}

export interface WorkstreamAgent {
  id: string;
  name: string;
  role: string;
  channel: string;
  lane: LaneId;
  laneLabel: string;
  status: AgentStatus;
  energy: number;
  focus: string;
  activeMission: string | null;
  capabilities: string[];
  persona?: string;
  prompt?: string;
  origin?: string;
  moveTarget?: { x: number; z: number; source?: "floor" | "zone"; issuedAt?: string | number; status?: string } | null;
  position?: { x: number; z: number } | null;
  kpi: string;
}

export interface Mission {
  id: string;
  taskId: string;
  title: string;
  lane: LaneId;
  laneLabel: string;
  laneGlyph: string;
  agentId?: string;
  agent: string;
  status: string;
  level: string;
  progress: number;
  priority: string;
  requiresApproval: boolean;
  reward: string;
  summary: string;
  runnable: boolean;
}

export interface Lane {
  id: LaneId;
  label: string;
  glyph: string;
  agentId: string | null;
  agentName: string;
  missionCount: number;
  load: number;
  status: "running" | "success" | "error" | "idle";
  done: number;
  total: number;
}

export interface MarketIndex {
  id: string;
  label: string;
  value: number;
  unit: string;
  delta: number;
  deltaPercent: number;
  trend: "up" | "down" | "flat";
  spark: number[];
}

export interface AgentPerformance {
  id: string;
  name: string;
  role: string;
  lane: LaneId;
  laneLabel: string;
  status: AgentStatus;
  statusLabel: string;
  score: number;
  delta: number;
  deltaPercent: number;
  trend: "up" | "down" | "flat";
  automationRatio: number;
  humanRatio: number;
  workload: number;
  volume: number;
  missionsTotal: number;
  missionsDone: number;
  missionsActive: number;
  summary: string;
  watch: boolean;
  runnableMissionId: string | null;
  spark: number[];
  rank: number;
}

export interface StreamBeat {
  id: string;
  ts: string;
  kind: string;
  level: string;
  lane: string;
  laneLabel: string;
  actor: string;
  title: string;
  detail: string;
  reward: string | null;
}

export interface Alert {
  id: string;
  kind: "approval" | "incident";
  severity: "warn" | "high";
  title: string;
  message: string;
  approvalId?: string;
  taskId?: string;
  agentId?: string;
}

export interface Objective {
  id: string;
  label: string;
  done: number;
  total: number;
  status: "done" | "progress" | "open";
}

export interface LaneStaffingHealth {
  lane: LaneId;
  label: string;
  agentCount: number;
  missionCount: number;
  load: number;
  health: "healthy" | "watch" | "gap";
  capacityLabel: string;
  skillGap: string;
  recommendedHireRole: string;
  nextAction: string;
}

export interface RecommendedHire {
  id: string;
  lane: LaneId;
  laneLabel: string;
  role: string;
  name: string;
  reason: string;
  firstMission: string;
  governanceNote: string;
  capabilities: string[];
}

export interface OperatingMilestone {
  id: string;
  label: string;
  done: number;
  total: number;
  status: "done" | "progress" | "open";
  meaning: string;
  unlocks: string;
}

export interface CoachingHint {
  id: string;
  severity: "info" | "warn" | "high";
  title: string;
  action: string;
  lane?: LaneId;
  agentId?: string;
}

export interface AgentOpsStrategy {
  headline: string;
  principle: string;
  laneHealth: LaneStaffingHealth[];
  recommendedHires: RecommendedHire[];
  operatingMilestones: OperatingMilestone[];
  coachingHints: CoachingHint[];
}

export interface Workstream {
  workspaceId: string;
  generatedAt: string;
  company: {
    name: string;
    edition: string;
    workspace: string;
    healthScore: number;
    healthDelta: number;
    automationLevel: number;
    tier: string;
    activeAgents: number;
    runningTasks: number;
    completed: number;
    failed: number;
    pendingApprovals: number;
  };
  headline: { title: string; detail: string; level: string; ts: string | null };
  missions: Mission[];
  agents: WorkstreamAgent[];
  lanes: Lane[];
  pipeline: { stages: { id: string; label: string; count: number }[] };
  objectives: Objective[];
  alerts: Alert[];
  agentOpsStrategy: AgentOpsStrategy;
  stream: StreamBeat[];
  agentPerformance: AgentPerformance[];
  market: {
    status: { code: string; label: string };
    asOf: string;
    indices: MarketIndex[];
    categories: { id: string; label: string; count: number }[];
  };
  watchlist: AgentPerformance[];
  counts: Record<string, number>;
}

export interface LiveLogEntry {
  id: string;
  ts: string;
  source: "runtime" | "agent" | "audit" | "office";
  level: string;
  actor: string;
  channel: string | null;
  action: string;
  message: string;
}

export interface LiveLog {
  workspaceId: string;
  generatedAt: string;
  total: number;
  returned: number;
  counts: Record<string, number>;
  entries: LiveLogEntry[];
}

export interface Connector {
  id: string;
  name: string;
  category?: string;
  status?: string;
  capabilities?: string[];
  description?: string;
  [k: string]: unknown;
}

export interface KnowledgeResult {
  id?: string;
  type?: string;
  label?: string;
  title?: string;
  score?: number;
  snippet?: string;
  [k: string]: unknown;
}

// --- Golden Image (core product identity) -----------------------------------

export type PlaneMaturity = "live" | "mock" | "planned";
export type PlaneRuntimeState = "running" | "queued" | "ready" | "planned";

export interface GoldenPlane {
  id: string;
  name: string;
  role: string;
  owns: string[];
  mustNotOwn: string[];
  surface: string;
  maturity: PlaneMaturity;
  runtime?: { state: PlaneRuntimeState; signals: Record<string, string | number> };
}

export interface GoldenInvariant {
  id: string;
  statement: string;
  rationale: string;
}

export interface GoldenUxLayer {
  id: string;
  name: string;
  tier: string;
  disclosure: string;
  description: string;
  invariantRefs: string[];
}

export interface GoldenImage {
  schema: string;
  version: string;
  product: string;
  codename: string;
  identity: { tagline: string; northStar: string; surface: string };
  lifecycle: string;
  invariants: GoldenInvariant[];
  planes: GoldenPlane[];
  uxLayers: GoldenUxLayer[];
  surfaces: { id: string; name: string; kind: string; path: string; uxLayer: string }[];
  workspaceId?: string;
  generatedAt?: string | null;
  status?: { planesTotal: number; planesLive: number; invariants: number; surface: string };
}


export interface RoleTemplate {
  id: string;
  lane: LaneId;
  label: string;
  role: string;
  capabilities: string[];
  kpi: string;
  persona: string;
  promptPreview: string;
}

// --- Orchestration boundary projections (Phase 3) ---------------------------
// Mattermost threads, runtime adapter runs and produced artifacts are surfaced by
// the control plane (GET /office/threads, /runtime/runs, /artifacts) and
// projected into visible signals in the 3D office. These mirror the shapes
// produced by packages/runtime (handleUserMessageIngest / handleAgentRunEnqueue).

export interface ThreadReply {
  id: string;
  actor: string;
  text: string;
  createdAt: string;
}

export interface OfficeThread {
  id: string;
  workspaceId?: string;
  provider: string;
  channelRef: string;
  threadRef: string;
  senderRef?: string;
  providerEventId?: string;
  linkedWorkItemId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: string;
  lastReply?: string;
  replies?: ThreadReply[];
}

export type OrchestratorRunStatus = "planned" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";

export interface OrchestratorRun {
  id: string;
  workspaceId?: string;
  taskId?: string;
  agentId?: string;
  provider: string;
  status: OrchestratorRunStatus | string;
  adapters?: string[];
  externalRef?: string | null;
  goal?: string;
  policyDecision?: string;
  approvalId?: string | null;
  artifactId?: string;
  note?: string;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string;
}

export interface OrchestrationAdapter {
  id: string;
  status: string;
  purpose: string;
  credentialState: string;
}

export interface OrchestrationBoundary {
  workspaceId: string;
  adapters: OrchestrationAdapter[];
  runs: OrchestratorRun[];
}

export interface Artifact {
  id: string;
  workspaceId?: string;
  type: string;
  title: string;
  contentRef?: string;
  sourceRunId?: string;
  visibleInOffice?: boolean;
  createdAt?: string;
  summary?: string;
}
