// Transport-free validation of the BINDERY BOX Control Plane. Exercises the
// pure router (no HTTP, no Next) so the business core can be verified in CI and
// on the stateless Vercel demo path. Run with: npm run check
import { handleRequest } from "../src/server/controlPlane.mjs";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
}

async function main() {
  // 1) health
  const health = await handleRequest({ method: "GET", pathname: "/api/health" });
  check("GET /api/health → 200 ok", health.status === 200 && health.body.ok === true, JSON.stringify(health.body.product));

  // 2) workstream projection
  const ws = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream" });
  check("GET workstream → company + agents", ws.status === 200 && ws.body.company && Array.isArray(ws.body.agents) && ws.body.agents.length > 0);
  check("workstream → agentPerformance ranked", Array.isArray(ws.body.agentPerformance) && ws.body.agentPerformance[0]?.rank === 1);
  check("workstream → market indices", Array.isArray(ws.body.market?.indices) && ws.body.market.indices.length > 0);

  // 3) live-log
  const log = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/live-log" });
  check("GET live-log → entries[]", log.status === 200 && Array.isArray(log.body.entries));

  // 4) connectors
  const conn = await handleRequest({ method: "GET", pathname: "/api/connectors" });
  check("GET connectors → list", conn.status === 200 && Array.isArray(conn.body.connectors) && conn.body.connectors.length > 0);

  // 5) golden image identity projection
  const golden = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/golden-image" });
  check("GET golden-image → Claw3D core identity", golden.status === 200 && golden.body.identity?.surface === "claw3d-3d-office" && golden.body.status?.planesTotal >= 6);

  // 6) knowledge search
  const know = await handleRequest({ method: "GET", pathname: "/api/knowledge/search", searchParams: new URLSearchParams({ q: "GitHub" }) });
  check("GET knowledge/search → results[]", know.status === 200 && Array.isArray(know.body.results));

  // 7) role templates for richer staff creation
  const templates = await handleRequest({ method: "GET", pathname: "/api/role-templates" });
  check("GET role-templates → presets", templates.status === 200 && Array.isArray(templates.body.templates) && templates.body.templates.length >= 4);

  // 8) plan preview flow — preview must not create a task yet
  const beforePreviewWs = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream" });
  const preview = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/plan-preview",
    body: { title: "GitHub PR 상태 triage", lane: "engineering", requestedBy: "ci" },
  });
  const afterPreviewWs = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream" });
  check("POST plan-preview → PlanPreview", preview.status === 200 && preview.body.preview?.expectedArtifacts?.length > 0 && preview.body.preview?.confidence > 0, preview.body.preview?.assignedAgentName);
  check("plan-preview does not mutate tasks", beforePreviewWs.body.missions.length === afterPreviewWs.body.missions.length);

  // 9) agent creation flow — create a safe custom staff member from a template
  const createAgent = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/agents",
    body: { name: "Demo Planner", role: "계획 담당", lane: "control", templateId: "tpl_control_ops", requestedBy: "ci" },
  });
  check("POST workspace agents → agent.create", createAgent.status === 200 && createAgent.body.ok === true && createAgent.body.result?.agent?.prompt, createAgent.body.result?.agent?.id);

  // 9) persisted movement lifecycle
  const move = await handleRequest({
    method: "POST",
    pathname: `/api/agents/${createAgent.body.result.agent.id}/move`,
    body: { x: 1.5, z: -2.5, source: "floor", requestedBy: "ci" },
  });
  check("POST agent move → agent.move.requested", move.status === 200 && move.body.ok === true && move.body.result?.moveTarget?.status === "accepted");

  // 10) zone work-request creates a real task
  const createdTask = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/tasks",
    body: { title: "GitHub 이슈 테스트 업무", lane: "engineering", enqueue: true, requestedBy: "ci" },
  });
  check("POST workspace tasks → task.create", createdTask.status === 200 && createdTask.body.ok === true && createdTask.body.result?.task?.origin === "zone.work-request", createdTask.body.result?.task?.id);


  // 11) Mattermost-like message ingest creates a real work item and orchestration boundary
  const ingest = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/messages/ingest",
    body: {
      provider: "mattermost",
      channelRef: "#engineering",
      senderRef: "ci-user",
      providerEventId: "ci-mm-1",
      text: "GitHub PR #42 CI 실패 원인 정리해서 계획 보여줘",
    },
  });
  check("POST message ingest → chat work item", ingest.status === 200 && ingest.body.ok === true && ingest.body.result?.thread?.provider === "mattermost" && ingest.body.result?.orchestratorRun?.provider === "paperclip-boundary", ingest.body.result?.task?.id);

  const threads = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/threads" });
  check("GET threads → ingested thread", threads.status === 200 && threads.body.threads?.some((t) => t.providerEventId === "ci-mm-1"));

  const boundary = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/orchestration-boundary" });
  check("GET orchestration-boundary → Paperclip/GitHub/Mattermost adapters", boundary.status === 200 && boundary.body.adapters?.some((a) => a.id === "paperclip") && boundary.body.runs?.length > 0);

  const boundaryRun = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/orchestration-boundary/runs",
    body: { taskId: createdTask.body.result.task.id, agentId: createdTask.body.result.agent.id, requestedBy: "ci", goal: "CI에서 Paperclip boundary 실행" },
  });
  check("POST orchestration-boundary/runs → Paperclip mock run", boundaryRun.status === 200 && boundaryRun.body.ok === true && boundaryRun.body.result?.artifact?.visibleInOffice === true, boundaryRun.body.result?.orchestratorRun?.id);

  const reply = await handleRequest({
    method: "POST",
    pathname: `/api/workspaces/default/threads/${ingest.body.result.thread.id}/reply`,
    body: { channelRef: "#engineering", text: "BINDERY mock reply: 실행 보고서가 생성되었습니다.", correlationId: ingest.body.result.thread.threadRef },
  });
  check("POST thread reply → Mattermost mock post", reply.status === 200 && reply.body.ok === true && reply.body.result?.post?.kind === "thread_reply");

  const artifacts = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/artifacts" });
  check("GET artifacts → visible office artifact", artifacts.status === 200 && artifacts.body.artifacts?.some((a) => a.visibleInOffice));

  // 12) task run + approval flow — pick a runnable mission from the workstream
  const refreshedWs = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream" });
  const runnable = refreshedWs.body.missions.find((m) => m.runnable);
  check("workstream has a runnable mission", !!runnable, runnable?.taskId);
  if (runnable) {
    const run = await handleRequest({ method: "POST", pathname: `/api/tasks/${runnable.taskId}/run`, body: { requestedBy: "ci" } });
    check("POST tasks/:id/run → ok", run.status === 200 && run.body.ok === true, `decision=${run.body.decision}`);

    // If the run required approval, decide it.
    const approvals = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/approvals" });
    const pending = (approvals.body.approvals ?? []).find((a) => a.status === "pending");
    if (pending) {
      const dec = await handleRequest({ method: "POST", pathname: `/api/approvals/${pending.id}/decision`, body: { decision: "approved", decidedBy: "ci" } });
      check("POST approvals/:id/decision → ok", dec.status === 200 && dec.body.ok === true, `decision=${dec.body.decision}`);
    }
  }

  // 7) 404 for unknown
  const miss = await handleRequest({ method: "GET", pathname: "/api/does-not-exist" });
  check("unknown route → 404", miss.status === 404);

  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("validate-core failed:", e);
  process.exit(1);
});
