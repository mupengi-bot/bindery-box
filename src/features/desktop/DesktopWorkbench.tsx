"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type LocalDeviceResponse = {
  manifest: {
    product: string;
    mode: string;
    invariant: string;
    defaultSurface: string;
    shell: { primaryViews: string[]; secondaryViews: string[] };
  };
  policy: {
    scopes: Array<{ id: string; label: string; status: string; access: string; guardrail?: string; grants?: LocalScope[] }>;
    defaults: Record<string, boolean>;
  };
  scopes: LocalScope[];
};

type LocalScope = { id: string; label: string; mode: string; pathLabel: string; status: string };
type FileEntry = { name: string; kind: "directory" | "file"; size: number | null; updatedAt: string | null; pathLabel: string };
type FileListResponse = { ok: boolean; scope: LocalScope | null; pathLabel: string | null; entries: FileEntry[]; message?: string };
type FilePreviewResponse = { ok: boolean; file: { name: string; pathLabel: string; size: number; updatedAt: string; truncated: boolean; content: string } };

type SetupStatus = {
  ready: boolean;
  workspace: { id: string; name: string };
  firstWorkItem: { id: string; title: string; expectedOutput: string } | null;
};

type Mission = { taskId: string; title: string; lane: string; status: string; runnable?: boolean; summary?: string };
type Workstream = {
  company?: { name: string };
  missions?: Mission[];
  agents?: Array<{ id: string; name: string; lane: string; status: string }>;
};
type Approval = { id: string; title: string; status: string; reason?: string; summary?: string; taskId?: string };
type ApprovalResponse = { approvals: Approval[] };
type Artifact = { id: string; title: string; type: string; summary?: string; contentRef?: string; sourceRunId?: string; visibleInOffice?: boolean };
type ArtifactsResponse = { artifacts: Artifact[] };
type ArtifactPreviewResponse = { ok: boolean; preview: { title: string; kind: string; summary: string; contentRef?: string; visibleInOffice: boolean } };
type LiveLogEntry = { id: string; ts: string; source: string; level: string; actor: string; action: string; message: string };
type LiveLogResponse = { entries: LiveLogEntry[] };
type PlanStep = string | { id?: string; label?: string; risk?: string; index?: number };
type PlanApproval = string | { id?: string; label?: string; reason?: string; risk?: string };
type PlanPreview = { title?: string; assignedAgent?: string; assignedAgentName?: string; lane?: string; confidence?: number; steps?: PlanStep[]; expectedArtifacts?: string[]; approvalBoundary?: string; approvals?: PlanApproval[]; eta?: string; estimatedMinutes?: number };
type PlanPreviewResponse = { ok: boolean; preview: PlanPreview };
type DiagnosticCheck = { id: string; label: string; status: "ok" | "warn" | "error" | string; detail: string };
type DiagnosticsResponse = {
  ok: boolean;
  generatedAt: string;
  runtime: { node: string; platform: string; pid: number; uptimeSeconds: number; memoryMb: { rss: number; heapUsed: number; heapTotal: number } };
  store: { backend: string; persistent: boolean; mode: string };
  counters: Record<string, number>;
  features: Array<{ id: string; label: string; status: string; endpoint: string }>;
  skillStatus: Array<{ id: string; label: string; status: string; detail: string }>;
  checks: DiagnosticCheck[];
  recentEvents: Array<{ id: string; ts: string; actor: string; action: string; message: string; target?: string }>;
};

declare global {
  interface Window {
    binderyDesktop?: {
      pickWorkspaceFolder: () => Promise<{ path: string } | null>;
      platform: string;
    };
  }
}

async function parseErrorMessage(res: Response, url: string): Promise<string> {
  try {
    const payload = await res.json() as { error?: string; message?: string };
    return payload.error || payload.message || `${url} failed: ${res.status}`;
  } catch {
    return `${url} failed: ${res.status}`;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseErrorMessage(res, url));
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res, url));
  return res.json() as Promise<T>;
}

function describePlanStep(step: PlanStep): string {
  if (typeof step === "string") return step;
  const prefix = step.index ? `${step.index}. ` : "";
  const suffix = step.risk ? ` · risk: ${step.risk}` : "";
  return `${prefix}${step.label ?? step.id ?? "Plan step"}${suffix}`;
}

function planStepKey(step: PlanStep, index: number): string {
  if (typeof step === "string") return `${index}:${step}`;
  return `${index}:${step.id ?? step.label ?? "step"}`;
}

function confidencePercent(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 78;
  return Math.round(value <= 1 ? value * 100 : value);
}

function describePlanApproval(approval: PlanApproval): string {
  if (typeof approval === "string") return approval;
  return approval.label ?? approval.reason ?? approval.id ?? "Human Gate approval required";
}

export default function DesktopWorkbench() {
  const [localDevice, setLocalDevice] = useState<LocalDeviceResponse | null>(null);
  const [files, setFiles] = useState<FileListResponse | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreviewResponse | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [workstream, setWorkstream] = useState<Workstream | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreviewResponse | null>(null);
  const [planPreview, setPlanPreview] = useState<PlanPreview | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [liveLog, setLiveLog] = useState<LiveLogEntry[]>([]);
  const [goalText, setGoalText] = useState("이번 주 포토부스 운영 문의를 정리하고 견적 초안/다음 액션을 만들어줘");
  const [folderPath, setFolderPath] = useState("");
  const [folderLabel, setFolderLabel] = useState("Operations workspace");
  const [writePath, setWritePath] = useState("bindery-output/ops-summary.md");
  const [writeContent, setWriteContent] = useState("# BINDERY Local Output\n\nHuman Gate 승인 후 생성된 로컬 파일입니다.\n");
  const [terminalCommand, setTerminalCommand] = useState("pwd && ls");
  const [browserUrl, setBrowserUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("Idle");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setActivity("Refreshing live state");
    const [device, setupStatus, stream, approvalsPayload, artifactsPayload, livePayload, diagnosticPayload, filesPayload] = await Promise.all([
      getJson<LocalDeviceResponse>("/api/workspaces/default/local-device"),
      getJson<SetupStatus>("/api/setup/status"),
      getJson<Workstream>("/api/workspaces/default/workstream"),
      getJson<ApprovalResponse>("/api/workspaces/default/approvals"),
      getJson<ArtifactsResponse>("/api/workspaces/default/artifacts"),
      getJson<LiveLogResponse>("/api/workspaces/default/live-log"),
      getJson<DiagnosticsResponse>("/api/workspaces/default/diagnostics"),
      getJson<FileListResponse>("/api/workspaces/default/local-device/files"),
    ]);
    const firstArtifactId = artifactsPayload.artifacts?.[0]?.id;
    const artifactPayload = firstArtifactId
      ? await getJson<ArtifactPreviewResponse>(`/api/workspaces/default/artifacts/${firstArtifactId}/preview`)
      : null;
    setLocalDevice(device);
    setSetup(setupStatus);
    setWorkstream(stream);
    setApprovals(approvalsPayload.approvals ?? []);
    setArtifacts(artifactsPayload.artifacts ?? []);
    setLiveLog(livePayload.entries ?? []);
    setDiagnostics(diagnosticPayload);
    setFiles(filesPayload);
    setArtifactPreview(artifactPayload);
    setActivity("Live state synced");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!browserUrl && typeof window !== "undefined") setBrowserUrl(window.location.origin);
    refresh().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "failed to load desktop workbench");
    });
    return () => {
      cancelled = true;
    };
  }, [browserUrl, refresh]);

  const runnable = useMemo(() => workstream?.missions?.filter((mission) => mission.runnable) ?? [], [workstream]);
  const pendingApprovals = useMemo(() => approvals.filter((approval) => approval.status === "pending"), [approvals]);
  const checks = diagnostics?.checks ?? [];
  const healthyChecks = checks.filter((check) => check.status === "ok").length;
  const healthPercent = checks.length ? Math.round((healthyChecks / checks.length) * 100) : 0;
  const healthLabel = diagnostics ? `${healthyChecks}/${checks.length} checks ok` : "loading checks";
  const latestLog = liveLog[0]?.message ?? "No live log yet";
  const workspaceCount = localDevice?.scopes.length ?? 0;
  const totalMissions = workstream?.missions?.length ?? 0;
  const activeAgents = workstream?.agents?.filter((agent) => agent.status !== "offline" && agent.status !== "idle").length ?? 0;
  const totalAgents = workstream?.agents?.length ?? 0;
  const visibleArtifacts = artifacts.filter((artifact) => artifact.visibleInOffice).length;
  const runEvents = liveLog.filter((entry) => entry.action.includes("run") || entry.source.includes("runtime")).length;
  const humanGatePercent = approvals.length ? Math.round((pendingApprovals.length / approvals.length) * 100) : 0;
  const executionPulse = Math.min(100, Math.max(12, runEvents * 12 + runnable.length * 10 + pendingApprovals.length * 8));
  const dataCards = [
    { label: "Missions", value: totalMissions, detail: `${runnable.length} runnable`, tone: "blue" },
    { label: "Agents", value: `${activeAgents}/${totalAgents}`, detail: "active staff", tone: "green" },
    { label: "Artifacts", value: artifacts.length, detail: `${visibleArtifacts} in office`, tone: "purple" },
    { label: "Approvals", value: pendingApprovals.length, detail: `${humanGatePercent}% gate load`, tone: pendingApprovals.length ? "amber" : "green" },
    { label: "Local scopes", value: workspaceCount, detail: localDevice?.policy.defaults.dataLeavesDevice === false ? "device-first" : "policy loading", tone: "cyan" },
    { label: "Live events", value: liveLog.length, detail: `${runEvents} runtime signals`, tone: "slate" },
  ];
  const connectorHealth = [
    { label: "Runtime", status: diagnostics?.ok ? "ok" : "warn", detail: diagnostics ? `${diagnostics.store.backend} store` : "loading" },
    { label: "Local Files", status: workspaceCount ? "ok" : "warn", detail: workspaceCount ? `${workspaceCount} scopes granted` : "folder grant needed" },
    { label: "Human Gate", status: pendingApprovals.length ? "warn" : "ok", detail: pendingApprovals.length ? `${pendingApprovals.length} approvals waiting` : "clear" },
    { label: "Artifacts", status: artifacts.length ? "ok" : "warn", detail: artifacts.length ? `${artifacts.length} generated` : "run work to create" },
    { label: "Office View", status: "ok", detail: "/office projection ready" },
    { label: "Live Log", status: liveLog.length ? "ok" : "warn", detail: liveLog.length ? `${liveLog.length} events` : "waiting for runtime signal" },
  ];
  const liveTimeline = [
    { label: "Goal", status: goalText.trim() ? "active" : "idle", detail: goalText.trim() ? "operator intent captured" : "waiting for input" },
    { label: "Plan", status: planPreview ? "active" : "idle", detail: planPreview ? planPreview.title ?? "preview ready" : "preview not requested" },
    { label: "Run", status: runnable.length ? "active" : "idle", detail: runnable.length ? `${runnable.length} runnable tasks` : "no runnable task" },
    { label: "Gate", status: pendingApprovals.length ? "warn" : "active", detail: pendingApprovals.length ? `${pendingApprovals.length} waiting` : "no blocker" },
    { label: "Artifact", status: artifacts.length ? "active" : "idle", detail: artifacts[0]?.title ?? "no output yet" },
  ];
  const agentGraph = (workstream?.agents ?? []).slice(0, 6).map((agent) => ({
    ...agent,
    tone: agent.status === "blocked" || agent.status === "error" ? "error" : agent.status === "idle" ? "idle" : "active",
    missions: workstream?.missions?.filter((mission) => mission.lane === agent.lane).length ?? 0,
  }));
  const bottlenecks = [
    { label: "Approvals", value: pendingApprovals.length, max: Math.max(1, approvals.length), tone: pendingApprovals.length ? "warn" : "ok" },
    { label: "Runnable queue", value: runnable.length, max: Math.max(1, totalMissions), tone: runnable.length ? "active" : "idle" },
    { label: "Health warnings", value: checks.filter((check) => check.status !== "ok").length, max: Math.max(1, checks.length), tone: checks.some((check) => check.status === "error") ? "error" : "warn" },
    { label: "Connector warnings", value: connectorHealth.filter((connector) => connector.status !== "ok").length, max: connectorHealth.length, tone: connectorHealth.some((connector) => connector.status === "error") ? "error" : "warn" },
  ];

  async function grantFolder() {
    if (!folderPath.trim()) {
      setError("로컬 폴더 경로를 먼저 입력해줘.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/workspaces/default/local-device/scopes", {
        path: folderPath,
        label: folderLabel || "Workspace Folder",
        mode: "read-write",
        requestedBy: "desktop-operator",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "folder grant failed");
    } finally {
      setBusy(false);
    }
  }

  async function chooseFolder() {
    if (!window.binderyDesktop) {
      setError("현재 브라우저 모드야. Electron shell에서는 native folder picker가 열린다.");
      return;
    }
    const picked = await window.binderyDesktop.pickWorkspaceFolder();
    if (picked?.path) {
      setFolderPath(picked.path);
      setBusy(true);
      setError(null);
      try {
        await postJson("/api/workspaces/default/local-device/scopes", {
          path: picked.path,
          label: folderLabel || "Workspace Folder",
          mode: "read-write",
          requestedBy: "desktop-native-picker",
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "native folder grant failed");
      } finally {
        setBusy(false);
      }
    }
  }

  async function previewFile(entry: FileEntry) {
    if (entry.kind !== "file") return;
    const scope = files?.scope;
    if (!scope) return;
    const relativePath = entry.pathLabel.replace(`${scope.pathLabel}/`, "").replace(scope.pathLabel, "");
    setBusy(true);
    setError(null);
    try {
      setFilePreview(await getJson<FilePreviewResponse>(`/api/workspaces/default/local-device/preview?path=${encodeURIComponent(relativePath)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "file preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestPlanPreview() {
    setBusy(true);
    setError(null);
    try {
      const payload = await postJson<PlanPreviewResponse>("/api/workspaces/default/plan-preview", {
        title: goalText,
        lane: "operations",
        requestedBy: "desktop-operator",
      });
      setPlanPreview(payload.preview);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "plan preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runFirstWorkItem() {
    if (!setup?.firstWorkItem?.id) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/tasks/${setup.firstWorkItem.id}/run`, { requestedBy: "desktop-operator" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "task run failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestFileWrite() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/workspaces/default/local-device/files/write", {
        path: writePath,
        content: writeContent,
        requestedBy: "desktop-operator",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "file write approval request failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestTerminalRun() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/workspaces/default/local-device/terminal/run", {
        command: terminalCommand,
        requestedBy: "desktop-operator",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "terminal approval request failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestBrowserOpen() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/workspaces/default/local-device/browser/open", {
        url: browserUrl,
        requestedBy: "desktop-operator",
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "browser approval request failed");
    } finally {
      setBusy(false);
    }
  }

  async function decideApproval(approval: Approval, decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/approvals/${approval.id}/decision`, { decision, decidedBy: "desktop-operator" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "approval decision failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="desktop-workbench" data-bx-theme="night">
      <aside className="desktop-sidebar">
        <div className="brand-block">
          <span className="brand-eyebrow">BINDERY BOX</span>
          <strong>Desktop</strong>
          <small>Local AI Operations Desk</small>
        </div>
        {["Goals", "Tasks", "Runs", "Artifacts", "Approvals", "Files", "Connectors", "Office View", "Settings"].map((item, index) => (
          <a className={index === 0 ? "nav-item active" : "nav-item"} href={item === "Office View" ? "/office" : "#"} key={item}>
            {item}
          </a>
        ))}
      </aside>

      <section className="desktop-main">
        <header className="desktop-titlebar">
          <div>
            <p>내 컴퓨터 안에서 일하는 AI 운영팀</p>
            <h1>Goal Composer</h1>
          </div>
          <div className="title-actions">
            <span className={setup?.ready ? "status-pill" : "status-pill warn"}>{setup?.ready ? "Local runtime ready" : "Booting local runtime"}</span>
            <button disabled={busy} onClick={() => refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "refresh failed"))} type="button">Refresh</button>
          </div>
        </header>

        <section className="top-status-grid" aria-label="Live desktop status">
          <div className="status-card accent"><span>Activity</span><strong>{busy ? "Working…" : activity}</strong><small>{latestLog}</small></div>
          <div className="status-card"><span>Human Gate</span><strong>{pendingApprovals.length}</strong><small>pending approvals</small></div>
          <div className="status-card"><span>Workspace</span><strong>{workspaceCount}</strong><small>local folder scopes</small></div>
          <div className="status-card"><span>Health</span><strong>{healthLabel}</strong><small>{diagnostics?.store.backend ?? "store loading"}</small></div>
        </section>

        <section className="command-board" aria-label="Total data command board">
          <div className="board-hero">
            <div className="board-copy">
              <span className="section-kicker">TOTAL OPERATIONS DATA</span>
              <h2>오늘 회사 상태가 카드와 흐름도로 바로 읽히게 만들었어.</h2>
              <p>미션·에이전트·승인·산출물·로컬 권한·런타임 로그를 한 화면에서 같은 언어로 묶어서 보여줘.</p>
            </div>
            <div className="board-gauge" style={{ "--pulse": `${executionPulse}%` } as CSSProperties}>
              <span>Execution pulse</span>
              <strong>{executionPulse}%</strong>
              <em>runs + runnable + gates</em>
            </div>
          </div>
          <div className="data-card-grid">
            {dataCards.map((card) => (
              <div className={`data-card ${card.tone}`} key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </div>
            ))}
          </div>
          <div className="ops-diagram" aria-label="Work loop diagram">
            <div className="diagram-node active"><span>Goal</span><strong>입력</strong></div>
            <div className="diagram-line" />
            <div className={planPreview ? "diagram-node active" : "diagram-node"}><span>Plan</span><strong>{planPreview ? "준비됨" : "대기"}</strong></div>
            <div className="diagram-line" />
            <div className={runnable.length ? "diagram-node active" : "diagram-node"}><span>Run</span><strong>{runnable.length} tasks</strong></div>
            <div className="diagram-line" />
            <div className={pendingApprovals.length ? "diagram-node warn" : "diagram-node active"}><span>Gate</span><strong>{pendingApprovals.length} pending</strong></div>
            <div className="diagram-line" />
            <div className={artifacts.length ? "diagram-node active" : "diagram-node"}><span>Artifact</span><strong>{artifacts.length} files</strong></div>
          </div>
          <div className="health-strip">
            <span>System health</span>
            <div className="strip-track"><i style={{ width: `${healthPercent || 8}%` }} /></div>
            <strong>{healthPercent}%</strong>
          </div>
        </section>

        <section className="visual-projections" aria-label="Operations visual projections">
          <article className="projection-card span-2 live-run-timeline">
            <div className="projection-heading">
              <span>LIVE RUN TIMELINE</span>
              <strong>업무가 어디서 멈췄는지 한 줄로 추적</strong>
            </div>
            <div className="timeline-rail">
              {liveTimeline.map((step) => (
                <div className={`timeline-step ${step.status}`} key={step.label}>
                  <i />
                  <span>{step.label}</span>
                  <strong>{step.detail}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="projection-card connector-health-map">
            <div className="projection-heading">
              <span>CONNECTOR HEALTH MAP</span>
              <strong>연결 상태</strong>
            </div>
            <div className="connector-grid">
              {connectorHealth.map((connector) => (
                <div className={`connector-node ${connector.status}`} key={connector.label}>
                  <i />
                  <strong>{connector.label}</strong>
                  <small>{connector.detail}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="projection-card agent-graph">
            <div className="projection-heading">
              <span>AGENT GRAPH</span>
              <strong>AI 직원 관계/상태</strong>
            </div>
            <div className="agent-graph-canvas">
              <div className="control-node">Control Plane</div>
              {(agentGraph.length ? agentGraph : [{ id: "ops", name: "Ops Penguin", lane: "operations", status: "loading", tone: "idle", missions: 0 }]).map((agent) => (
                <div className={`agent-node ${agent.tone}`} key={agent.id}>
                  <strong>{agent.name}</strong>
                  <span>{agent.lane} · {agent.status}</span>
                  <small>{agent.missions} linked missions</small>
                </div>
              ))}
            </div>
          </article>

          <article className="projection-card span-2 bottleneck-chart">
            <div className="projection-heading">
              <span>BOTTLENECK CHART</span>
              <strong>승인·큐·상태 경고가 쌓이는 지점</strong>
            </div>
            <div className="bottleneck-list">
              {bottlenecks.map((item) => (
                <div className={`bottleneck-row ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <div className="bar-track"><i style={{ width: `${Math.round((item.value / item.max) * 100)}%` }} /></div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="quick-actions" aria-label="Quick actions">
          <button disabled={busy} onClick={requestPlanPreview} type="button">Preview plan</button>
          <button className="primary" disabled={busy} onClick={runFirstWorkItem} type="button">Run first work</button>
          <button disabled={busy} onClick={chooseFolder} type="button">Add folder</button>
          <a className="quick-link" href="/office">Open 3D Office</a>
        </section>

        <section className="composer-card">
          <textarea onChange={(event) => setGoalText(event.target.value)} value={goalText} aria-label="Goal composer" />
          <div className="composer-actions">
            <span>외부 전송·파일 수정·브라우저 제출은 Human Gate 승인 후 실행</span>
            <button disabled={busy} onClick={requestPlanPreview} type="button">Plan Preview</button>
            <button className="primary" disabled={busy} onClick={runFirstWorkItem} type="button">Execute First Work Locally</button>
          </div>
          {planPreview ? (
            <div className="plan-preview-box">
              <strong>{planPreview.title ?? goalText}</strong>
              <span>{planPreview.assignedAgentName ?? planPreview.assignedAgent ?? planPreview.lane ?? "operations"} · confidence {confidencePercent(planPreview.confidence)}%</span>
              <ol>{(planPreview.steps ?? []).slice(0, 4).map((step, index) => <li key={planStepKey(step, index)}>{describePlanStep(step)}</li>)}</ol>
              <small>{planPreview.approvalBoundary ?? planPreview.approvals?.map(describePlanApproval).join(", ") ?? "Human Gate required for external or local side effects."}</small>
            </div>
          ) : null}
        </section>

        {error ? <div className="error-box">{error}</div> : null}

        <section className="grid-panels">
          <article className="work-panel">
            <h2>Local Device Plane</h2>
            <p>{localDevice?.manifest.invariant ?? "loading local policy…"}</p>
            <div className="metric-row"><span>Mode</span><strong>{localDevice?.manifest.mode ?? "—"}</strong></div>
            <div className="metric-row"><span>Workspace scopes</span><strong>{localDevice?.scopes.length ?? 0}</strong></div>
            <div className="metric-row"><span>Data leaves device</span><strong>{localDevice?.policy.defaults.dataLeavesDevice === false ? "No by default" : "Unknown"}</strong></div>
          </article>

          <article className="work-panel">
            <h2>Grant workspace folder</h2>
            <input aria-label="folder label" onChange={(event) => setFolderLabel(event.target.value)} placeholder="Label" value={folderLabel} />
            <input aria-label="folder path" onChange={(event) => setFolderPath(event.target.value)} placeholder="/path/to/workspace" value={folderPath} />
            <div className="button-row">
              <button disabled={busy} onClick={chooseFolder} type="button">Choose folder</button>
              <button className="primary" disabled={busy} onClick={grantFolder} type="button">Grant local folder</button>
            </div>
            <small>브라우저 모드는 직접 경로 입력, Electron shell은 native folder picker 사용.</small>
          </article>

          <article className="work-panel span-2">
            <h2>Workspace files</h2>
            <p>{files?.pathLabel ?? files?.message ?? "아직 허용된 폴더가 없어."}</p>
            <div className="file-grid">
              {(files?.entries ?? []).slice(0, 8).map((entry) => (
                <button className="file-row" key={entry.pathLabel} onClick={() => previewFile(entry)} type="button">
                  <span>{entry.kind === "directory" ? "📁" : "📄"} {entry.name}</span>
                  <em>{entry.size === null ? entry.kind : `${Math.ceil(entry.size / 1024)} KB`}</em>
                </button>
              ))}
            </div>
            {filePreview ? <pre className="preview-box">{filePreview.file.content}</pre> : null}
          </article>

          <article className="work-panel span-2">
            <h2>Local file write through Human Gate</h2>
            <input aria-label="write path" onChange={(event) => setWritePath(event.target.value)} value={writePath} />
            <textarea aria-label="write content" onChange={(event) => setWriteContent(event.target.value)} value={writeContent} />
            <button className="primary" disabled={busy || !localDevice?.scopes.length} onClick={requestFileWrite} type="button">Request file write approval</button>
            <small>쓰기 작업은 즉시 실행되지 않고 approval packet을 만든 뒤 Approve 시 실제 파일에 반영된다.</small>
          </article>

          <article className="work-panel">
            <h2>Terminal command through Human Gate</h2>
            <input aria-label="terminal command" onChange={(event) => setTerminalCommand(event.target.value)} value={terminalCommand} />
            <button className="primary" disabled={busy || !localDevice?.scopes.length} onClick={requestTerminalRun} type="button">Request terminal approval</button>
            <small>승인 후 허용된 workspace 폴더에서 명령을 실행하고 결과를 live log에 남긴다.</small>
          </article>

          <article className="work-panel">
            <h2>Browser automation gate</h2>
            <input aria-label="browser url" onChange={(event) => setBrowserUrl(event.target.value)} value={browserUrl} />
            <button className="primary" disabled={busy} onClick={requestBrowserOpen} type="button">Request browser approval</button>
            <small>승인 후 로컬 브라우저 open intent를 실행한다. 로그인/제출/업로드는 별도 승인 경계.</small>
          </article>

          <article className="work-panel">
            <h2>First Work Loop</h2>
            <p>{setup?.firstWorkItem?.title ?? "loading first work item…"}</p>
            <div className="artifact-preview">{setup?.firstWorkItem?.expectedOutput ?? "—"}</div>
          </article>

          <article className="work-panel">
            <h2>Artifact Preview</h2>
            <p>{artifactPreview?.preview.title ?? artifacts[0]?.title ?? "No artifact yet"}</p>
            <div className="artifact-preview">{artifactPreview?.preview.summary ?? artifacts[0]?.summary ?? "Run local work to generate an artifact."}</div>
          </article>

          <article className="work-panel span-2">
            <h2>Runnable tasks</h2>
            <div className="task-list">
              {(runnable.length ? runnable : workstream?.missions ?? []).slice(0, 5).map((mission) => (
                <div className="task-row" key={mission.taskId}>
                  <span>{mission.title}</span>
                  <em>{mission.lane} · {mission.status}</em>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>

      <aside className="desktop-rightbar">
        <details className="work-panel compact-panel" open>
          <summary><span>Approvals</span><strong>{pendingApprovals.length}</strong></summary>
          {pendingApprovals.length ? pendingApprovals.slice(0, 6).map((approval) => (
            <div className="gate-row" key={approval.id}>
              <strong>{approval.title}</strong>
              <span>{approval.reason ?? approval.status}</span>
              <small>{approval.summary ?? approval.taskId}</small>
              <div className="button-row">
                <button disabled={busy} onClick={() => decideApproval(approval, "approved")} type="button">Approve</button>
                <button disabled={busy} onClick={() => decideApproval(approval, "rejected")} type="button">Reject</button>
              </div>
            </div>
          )) : <p>No pending Human Gate approval.</p>}
        </details>
        <details className="work-panel compact-panel">
          <summary><span>Access gates</span><strong>{localDevice?.policy.scopes.length ?? 0}</strong></summary>
          {(localDevice?.policy.scopes ?? []).map((scope) => (
            <div className="gate-row" key={scope.id}>
              <strong>{scope.label}</strong>
              <span>{scope.status}</span>
              <small>{scope.guardrail ?? scope.access}</small>
            </div>
          ))}
        </details>
        <details className="work-panel compact-panel" open>
          <summary><span>Internal Console</span><strong>{healthLabel}</strong></summary>
          <div className="metric-row"><span>Store</span><strong>{diagnostics?.store.backend ?? "—"} {diagnostics?.store.persistent ? "persistent" : ""}</strong></div>
          <div className="metric-row"><span>Memory</span><strong>{diagnostics ? `${diagnostics.runtime.memoryMb.rss}MB rss` : "—"}</strong></div>
          <div className="metric-row"><span>PID</span><strong>{diagnostics?.runtime.pid ?? "—"}</strong></div>
          <div className="console-grid">
            {checks.slice(0, 6).map((check) => (
              <div className={`console-check ${check.status}`} key={check.id}>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
            ))}
          </div>
        </details>
        <details className="work-panel compact-panel">
          <summary><span>Feature / Skill Status</span><strong>{diagnostics?.features.length ?? 0}</strong></summary>
          <div className="mini-list">
            {diagnostics?.features.slice(0, 8).map((feature) => (
              <div className="mini-row" key={feature.id}><strong>{feature.label}</strong><span>{feature.status}</span></div>
            ))}
            {diagnostics?.skillStatus.map((skill) => (
              <div className="mini-row" key={skill.id}><strong>{skill.label}</strong><span>{skill.status}</span></div>
            ))}
          </div>
        </details>
        <details className="work-panel compact-panel" open>
          <summary><span>Live Operations Log</span><strong>{liveLog.length}</strong></summary>
          <div className="log-list">
            {liveLog.slice(0, 8).map((entry) => (
              <div className={`log-row ${entry.level}`} key={entry.id}>
                <strong>{entry.source}</strong>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </details>
      </aside>

      <style jsx>{`
        .desktop-workbench { min-height: 100vh; display: grid; grid-template-columns: 204px minmax(0, 1fr) 400px; background: radial-gradient(900px 520px at 45% 0%, #17213f 0%, #070b16 68%); color: #e8eefc; }
        .desktop-sidebar, .desktop-rightbar { border-right: 1px solid rgba(120,150,220,.16); background: rgba(8, 13, 28, .82); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .desktop-sidebar { position: sticky; top: 0; height: 100vh; }
        .desktop-rightbar { border-left: 1px solid rgba(120,150,220,.16); border-right: 0; overflow: auto; max-height: 100vh; }
        .brand-block { display: grid; gap: 4px; margin-bottom: 18px; }
        .brand-eyebrow { color: #93a0c4; font-size: 11px; letter-spacing: .24em; }
        .brand-block strong { font-size: 24px; }
        .brand-block small, small { color: #93a0c4; }
        .nav-item { text-align: left; color: #93a0c4; background: transparent; border: 0; border-radius: 10px; padding: 10px 12px; cursor: pointer; text-decoration: none; }
        .nav-item.active, .nav-item:hover { color: #fff; background: rgba(91, 140, 255, .16); }
        .desktop-main { min-width: 0; padding: 22px; overflow: auto; }
        .desktop-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
        .desktop-titlebar p { margin: 0 0 4px; color: #93a0c4; }
        .desktop-titlebar h1 { margin: 0; font-size: clamp(28px, 3vw, 38px); letter-spacing: -.03em; }
        .title-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .status-pill { border: 1px solid rgba(33,212,168,.4); color: #8ff5d8; border-radius: 999px; padding: 8px 12px; background: rgba(33,212,168,.1); white-space: nowrap; }
        .status-pill.warn { border-color: rgba(245,165,36,.42); color: #ffd48a; background: rgba(245,165,36,.1); }
        .top-status-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
        .status-card { border: 1px solid rgba(120,150,220,.16); background: rgba(255,255,255,.045); border-radius: 16px; padding: 12px; display: grid; gap: 4px; min-height: 92px; }
        .status-card.accent { background: linear-gradient(135deg, rgba(91,140,255,.18), rgba(33,212,168,.08)); border-color: rgba(91,140,255,.32); }
        .status-card span { color: #93a0c4; font-size: 12px; }
        .status-card strong { font-size: 18px; line-height: 1.2; }
        .status-card small { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .command-board { border: 1px solid rgba(120,150,220,.2); background: linear-gradient(135deg, rgba(20,30,58,.9), rgba(9,14,28,.72)); border-radius: 22px; padding: 16px; margin-bottom: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.34); }
        .board-hero { display: grid; grid-template-columns: minmax(0, 1fr) 174px; gap: 16px; align-items: stretch; margin-bottom: 14px; }
        .section-kicker { color: #8ff5d8; font-size: 11px; letter-spacing: .26em; font-weight: 800; }
        .board-copy h2 { margin: 8px 0 8px; font-size: clamp(24px, 3vw, 36px); line-height: 1.05; letter-spacing: -.045em; max-width: 760px; }
        .board-copy p { color: #aab6dd; margin: 0; line-height: 1.55; max-width: 760px; }
        .board-gauge { --pulse: 50%; position: relative; isolation: isolate; min-height: 160px; border-radius: 24px; display: grid; place-items: center; text-align: center; overflow: hidden; border: 1px solid rgba(91,140,255,.26); background: radial-gradient(circle at 50% 50%, rgba(91,140,255,.2), rgba(255,255,255,.04)); }
        .board-gauge::before { content: ""; position: absolute; inset: 18px; border-radius: 999px; background: conic-gradient(#21d4a8 var(--pulse), rgba(255,255,255,.08) 0); z-index: -2; }
        .board-gauge::after { content: ""; position: absolute; inset: 30px; border-radius: 999px; background: #0d1428; z-index: -1; box-shadow: inset 0 0 24px rgba(255,255,255,.04); }
        .board-gauge span, .board-gauge em { color: #93a0c4; font-size: 11px; font-style: normal; }
        .board-gauge strong { display: block; font-size: 34px; letter-spacing: -.05em; }
        .data-card-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
        .data-card { position: relative; overflow: hidden; min-height: 112px; border: 1px solid rgba(120,150,220,.16); background: rgba(255,255,255,.045); border-radius: 16px; padding: 12px; display: grid; align-content: space-between; }
        .data-card::after { content: ""; position: absolute; width: 80px; height: 80px; right: -28px; top: -28px; border-radius: 999px; background: rgba(91,140,255,.18); }
        .data-card.green::after { background: rgba(33,212,168,.18); } .data-card.purple::after { background: rgba(178,127,255,.2); } .data-card.amber::after { background: rgba(245,165,36,.2); } .data-card.cyan::after { background: rgba(72,202,228,.18); } .data-card.slate::after { background: rgba(147,160,196,.18); }
        .data-card span { color: #93a0c4; font-size: 12px; }
        .data-card strong { font-size: 28px; letter-spacing: -.04em; }
        .data-card small { color: #c6d2f2; }
        .ops-diagram { display: grid; grid-template-columns: 1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr; align-items: center; gap: 8px; margin-top: 14px; }
        .diagram-node { min-height: 78px; border: 1px solid rgba(120,150,220,.16); background: rgba(255,255,255,.04); border-radius: 16px; padding: 12px; display: grid; gap: 4px; }
        .diagram-node.active { border-color: rgba(33,212,168,.34); background: rgba(33,212,168,.08); }
        .diagram-node.warn { border-color: rgba(245,165,36,.38); background: rgba(245,165,36,.1); }
        .diagram-node span { color: #93a0c4; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
        .diagram-node strong { font-size: 15px; }
        .diagram-line { height: 2px; background: linear-gradient(90deg, rgba(91,140,255,.18), rgba(33,212,168,.56)); border-radius: 999px; }
        .health-strip { display: grid; grid-template-columns: auto minmax(80px, 1fr) auto; gap: 10px; align-items: center; margin-top: 14px; color: #93a0c4; font-size: 12px; }
        .strip-track { height: 8px; background: rgba(255,255,255,.07); border-radius: 999px; overflow: hidden; }
        .strip-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5b8cff, #21d4a8); }
        .health-strip strong { color: #e8eefc; }
        .visual-projections { display: grid; grid-template-columns: 1.15fr .85fr; gap: 14px; margin-bottom: 16px; }
        .projection-card { border: 1px solid rgba(120,150,220,.18); background: linear-gradient(145deg, rgba(15,21,40,.82), rgba(9,14,28,.7)); border-radius: 18px; padding: 14px; box-shadow: 0 16px 48px rgba(0,0,0,.28); }
        .projection-heading { display: grid; gap: 4px; margin-bottom: 12px; }
        .projection-heading span { color: #8ff5d8; font-size: 10px; letter-spacing: .22em; font-weight: 800; }
        .projection-heading strong { font-size: 15px; }
        .timeline-rail { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; position: relative; }
        .timeline-step { border: 1px solid rgba(120,150,220,.14); background: rgba(255,255,255,.04); border-radius: 14px; padding: 12px; display: grid; gap: 6px; min-height: 112px; position: relative; overflow: hidden; }
        .timeline-step::after { content: ""; position: absolute; left: 18px; right: -18px; top: 21px; height: 2px; background: linear-gradient(90deg, rgba(91,140,255,.45), rgba(33,212,168,.18)); z-index: 0; }
        .timeline-step:last-child::after { display: none; }
        .timeline-step i, .connector-node i { width: 14px; height: 14px; border-radius: 999px; background: #64748b; box-shadow: 0 0 0 5px rgba(100,116,139,.12); z-index: 1; }
        .timeline-step.active i, .connector-node.ok i { background: #21d4a8; box-shadow: 0 0 0 5px rgba(33,212,168,.14); }
        .timeline-step.warn i, .connector-node.warn i { background: #f5a524; box-shadow: 0 0 0 5px rgba(245,165,36,.16); }
        .timeline-step span, .connector-node small, .agent-node span, .agent-node small { color: #93a0c4; font-size: 12px; }
        .timeline-step strong { font-size: 13px; line-height: 1.35; }
        .connector-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .connector-node { min-height: 82px; border: 1px solid rgba(120,150,220,.14); background: rgba(255,255,255,.04); border-radius: 14px; padding: 10px; display: grid; gap: 5px; }
        .connector-node.warn { border-color: rgba(245,165,36,.24); background: rgba(245,165,36,.07); }
        .connector-node.error { border-color: rgba(255,93,115,.32); background: rgba(255,93,115,.08); }
        .agent-graph-canvas { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-top: 52px; }
        .control-node { position: absolute; top: 0; left: 50%; transform: translateX(-50%); border: 1px solid rgba(91,140,255,.34); background: rgba(91,140,255,.14); color: #dbe7ff; border-radius: 999px; padding: 8px 13px; font-size: 12px; font-weight: 800; }
        .agent-node { border: 1px solid rgba(120,150,220,.16); background: rgba(255,255,255,.04); border-radius: 14px; padding: 10px; min-height: 90px; display: grid; gap: 5px; position: relative; }
        .agent-node::before { content: ""; position: absolute; left: 50%; top: -20px; width: 1px; height: 20px; background: linear-gradient(180deg, rgba(91,140,255,.55), rgba(91,140,255,0)); }
        .agent-node.active { border-color: rgba(33,212,168,.28); background: rgba(33,212,168,.07); }
        .agent-node.error { border-color: rgba(255,93,115,.3); background: rgba(255,93,115,.08); }
        .agent-node.idle { opacity: .78; }
        .bottleneck-list { display: grid; gap: 10px; }
        .bottleneck-row { display: grid; grid-template-columns: 136px minmax(90px, 1fr) 32px; gap: 10px; align-items: center; color: #c6d2f2; }
        .bar-track { height: 11px; background: rgba(255,255,255,.07); border-radius: 999px; overflow: hidden; }
        .bar-track i { display: block; height: 100%; width: 0; border-radius: inherit; background: #64748b; }
        .bottleneck-row.active .bar-track i { background: linear-gradient(90deg, #5b8cff, #21d4a8); }
        .bottleneck-row.ok .bar-track i { background: #21d4a8; }
        .bottleneck-row.warn .bar-track i { background: #f5a524; }
        .bottleneck-row.error .bar-track i { background: #ff5d73; }
        .bottleneck-row strong { text-align: right; }
        .quick-actions { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
        .quick-link { color: #dbe7ff; text-decoration: none; border: 1px solid rgba(120,150,220,.2); background: rgba(255,255,255,.08); border-radius: 10px; padding: 9px 12px; }
        .composer-card, .work-panel { border: 1px solid rgba(120,150,220,.18); background: rgba(15,21,40,.76); border-radius: 18px; box-shadow: 0 18px 50px rgba(0,0,0,.32); }
        .composer-card { padding: 16px; margin-bottom: 18px; }
        textarea, input { width: 100%; background: rgba(255,255,255,.04); border: 1px solid rgba(120,150,220,.18); border-radius: 14px; color: #fff; padding: 12px; font: inherit; margin-bottom: 8px; }
        textarea { min-height: 110px; resize: vertical; }
        .composer-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: #93a0c4; }
        .composer-actions span { flex: 1; }
        .plan-preview-box { margin-top: 12px; border: 1px solid rgba(33,212,168,.26); background: rgba(33,212,168,.08); border-radius: 14px; padding: 12px; display: grid; gap: 8px; }
        .plan-preview-box span, .plan-preview-box small { color: #aeeedc; }
        .plan-preview-box ol { margin: 0; padding-left: 20px; color: #dbe7ff; }
        button { background: rgba(255,255,255,.08); color: #e8eefc; border: 1px solid rgba(120,150,220,.2); border-radius: 10px; padding: 9px 12px; cursor: pointer; transition: transform .14s ease, background .14s ease, border-color .14s ease; }
        button:hover:not(:disabled), .quick-link:hover { transform: translateY(-1px); background: rgba(91,140,255,.16); border-color: rgba(91,140,255,.38); }
        button:focus-visible, .quick-link:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid rgba(91,140,255,.72); outline-offset: 2px; }
        button:disabled { opacity: .5; cursor: not-allowed; }
        button.primary { background: #5b8cff; color: white; border-color: #5b8cff; }
        button.full { width: 100%; margin-bottom: 8px; }
        .grid-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .work-panel { padding: 16px; }
        .work-panel h2 { margin: 0 0 10px; font-size: 15px; }
        .compact-panel { padding: 0; overflow: hidden; }
        .compact-panel summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 14px 16px; border-radius: 18px; }
        .compact-panel summary::-webkit-details-marker { display: none; }
        .compact-panel summary strong { color: #8ff5d8; font-size: 12px; border: 1px solid rgba(33,212,168,.24); border-radius: 999px; padding: 3px 8px; background: rgba(33,212,168,.08); }
        .compact-panel[open] { padding-bottom: 12px; }
        .compact-panel[open] > :not(summary) { margin-left: 16px; margin-right: 16px; }
        .work-panel p { color: #aab6dd; line-height: 1.5; }
        .span-2 { grid-column: span 2; }
        .metric-row, .task-row, .gate-row, .log-row { border-top: 1px solid rgba(120,150,220,.14); padding: 10px 0; display: grid; gap: 4px; }
        .metric-row { grid-template-columns: 1fr auto; }
        .metric-row span, .task-row em, .gate-row span, .gate-row small, .log-row span { color: #93a0c4; font-style: normal; }
        .artifact-preview, .preview-box { background: rgba(255,255,255,.05); border-radius: 12px; padding: 12px; color: #dbe7ff; overflow: auto; }
        .preview-box { max-height: 220px; white-space: pre-wrap; font-size: 12px; }
        .file-grid { display: grid; gap: 8px; }
        .file-row { width: 100%; display: flex; justify-content: space-between; text-align: left; }
        .file-row em { color: #93a0c4; font-style: normal; }
        .button-row { display: flex; gap: 8px; }
        .console-grid, .mini-list { display: grid; gap: 8px; margin-top: 10px; }
        .console-check, .mini-row { border: 1px solid rgba(120,150,220,.14); background: rgba(255,255,255,.04); border-radius: 12px; padding: 9px; display: grid; gap: 4px; }
        .console-check.ok strong { color: #21d4a8; } .console-check.warn strong { color: #f5a524; } .console-check.error strong { color: #ff5d73; }
        .console-check span, .mini-row span { color: #93a0c4; font-size: 12px; }
        .mini-row { grid-template-columns: 1fr auto; align-items: center; }
        .log-row.running strong { color: #f5a524; } .log-row.success strong { color: #21d4a8; } .log-row.error strong { color: #ff5d73; }
        .error-box { border: 1px solid rgba(255,93,115,.4); background: rgba(255,93,115,.12); color: #ffd3da; padding: 12px; border-radius: 12px; margin-bottom: 14px; }
        @media (max-width: 1320px) { .desktop-workbench { grid-template-columns: 176px minmax(0, 1fr); } .desktop-rightbar { grid-column: 1 / -1; max-height: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-left: 0; border-top: 1px solid rgba(120,150,220,.16); } .data-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 900px) { .desktop-workbench { display: block; } .desktop-sidebar { position: static; height: auto; flex-direction: row; overflow-x: auto; } .brand-block { min-width: 150px; margin-bottom: 0; } .desktop-titlebar, .composer-actions, .board-hero { align-items: flex-start; grid-template-columns: 1fr; flex-direction: column; } .top-status-grid, .grid-panels, .desktop-rightbar, .data-card-grid, .visual-projections, .timeline-rail, .connector-grid, .agent-graph-canvas { grid-template-columns: 1fr; } .timeline-step::after, .agent-node::before { display: none; } .ops-diagram { grid-template-columns: 1fr; } .diagram-line { width: 2px; height: 20px; justify-self: center; background: linear-gradient(180deg, rgba(91,140,255,.18), rgba(33,212,168,.56)); } .board-gauge { width: 100%; } .span-2 { grid-column: auto; } .bottleneck-row { grid-template-columns: 1fr; } .bottleneck-row strong { text-align: left; } }
      `}</style>
    </main>
  );
}
