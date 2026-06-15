// Phase 3 — 3D Projection Realization contract checks.
//
// Two layers:
//   1) Control-plane contract: the office data model can read Mattermost
//      threads, orchestration runs and artifacts, and ingest creates new ones.
//   2) Wiring contract (source-string checks, matching validate-rts-office):
//      useOfficeData fetches the three endpoints, the scene renders desk/run/
//      artifact/zone signals from the renderer-agnostic projection, and the HUD
//      exposes the synced threads/runs/artifacts.
import * as fs from "node:fs/promises";
import { createMemoryStore } from "../packages/data-store/src/index.mjs";
import { seedDemoState } from "../packages/runtime/src/index.mjs";
import { handleRequest } from "../src/server/controlPlane.mjs";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
}
async function read(path) { return fs.readFile(path, "utf8"); }

async function main() {
  // Use an explicit in-memory store so validation never mutates hosted/persistent
  // state when SUPABASE_* environment variables are present in CI or deployment
  // shells. The store is still driven through the Control Plane contract.
  const store = createMemoryStore(seedDemoState());

  // 1) seeded orchestration signals are readable through the office endpoints.
  const threads = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/threads", store });
  check("GET threads → seeded office threads", threads.status === 200 && Array.isArray(threads.body.threads) && threads.body.threads.length > 0, `${threads.body.threads?.length} threads`);
  check("threads link to work items", threads.body.threads?.every((t) => "linkedWorkItemId" in t));

  const boundary = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/orchestration-boundary", store });
  check("GET orchestration-boundary → adapters + runs", boundary.status === 200 && boundary.body.adapters?.length > 0 && Array.isArray(boundary.body.runs) && boundary.body.runs.length > 0, `${boundary.body.runs?.length} runs`);
  check("runs carry status + agent attribution", boundary.body.runs?.every((r) => r.status && (r.agentId || r.taskId)));
  check("runs cover active + completed states", boundary.body.runs?.some((r) => r.status === "running") && boundary.body.runs?.some((r) => r.status === "completed"));

  const artifacts = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/artifacts", store });
  check("GET artifacts → office-visible artifact", artifacts.status === 200 && artifacts.body.artifacts?.some((a) => a.visibleInOffice && a.sourceRunId));

  // 2) ingest creates a new thread + orchestration run (live projection grows).
  const before = boundary.body.runs.length;
  const ingest = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/messages/ingest",
    store,
    body: { provider: "mattermost", channelRef: "#engineering", senderRef: "ci", providerEventId: "proj-ci-1", text: "GitHub PR #7 CI 실패 원인 정리" },
  });
  check("POST ingest → new thread + run", ingest.status === 200 && ingest.body.result?.thread?.id && ingest.body.result?.orchestratorRun?.id);
  const afterBoundary = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/orchestration-boundary", store });
  check("ingest grows orchestration runs", afterBoundary.body.runs.length > before);

  const stateWithForeignRun = await store.load();
  stateWithForeignRun.orchestratorRuns.push({
    id: "orch_foreign_workspace",
    workspaceId: "ws_foreign",
    taskId: "task_foreign",
    agentId: "agent_foreign",
    provider: "paperclip-boundary",
    status: "running",
    adapters: ["paperclip"],
    goal: "foreign workspace isolation regression",
    createdAt: new Date().toISOString(),
  });
  await store.save(stateWithForeignRun);
  const filteredBoundary = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/orchestration-boundary", store });
  check("orchestration-boundary filters runs by workspace",
    filteredBoundary.body.runs.every((r) => !r.workspaceId || r.workspaceId === filteredBoundary.body.workspaceId));

  // 3) wiring contract — source-string checks.
  const useData = await read("src/features/office/useOfficeData.ts");
  check("useOfficeData fetches threads/boundary/artifacts",
    useData.includes("/threads") && useData.includes("/orchestration-boundary") && useData.includes("/artifacts") && useData.includes("orchestratorRuns"));

  const controlPlane = await read("src/server/controlPlane.mjs");
  check("orchestration-boundary source keeps workspace isolation",
    controlPlane.includes("orchestratorRuns ?? []).filter") && controlPlane.includes("run.workspaceId === wsId"));

  const projection = await read("src/features/office/scene/projection.ts");
  check("projection maps runs/threads/artifacts → signals",
    projection.includes("projectOfficeSignals") && projection.includes("byAgent") && projection.includes("byLane") && projection.includes("RUN_STATUS_COLOR"));
  check("projection derives agent cognition packets",
    projection.includes("AgentCognition") && projection.includes("cognitionFromSignal") && projection.includes("goal") && projection.includes("decision") && projection.includes("risk") && projection.includes("output"));

  const scene = await read("src/features/office/scene/OfficeScene.tsx");
  check("scene renders desk + zone signals",
    scene.includes("DeskSignals") && scene.includes("ZoneStatus") && scene.includes("signals?.byAgent") && scene.includes("signals?.byLane"));
  check("scene shows run beacon + artifact objects",
    scene.includes("primaryRun") && scene.includes("artifactCount") && scene.includes("runStatusColor"));
  const avatar = await read("src/features/office/scene/AgentAvatar.tsx");
  check("scene renders cognition above penguins",
    scene.includes("cognition={signals?.byAgent.get") && avatar.includes("CognitionBubble") && avatar.includes("state-backed \"mind\" projection"));

  const exp = await read("src/features/office/OfficeExperience.tsx");
  check("experience projects signals into scene", exp.includes("projectOfficeSignals") && exp.includes("signals={officeSignals}"));

  const types = await read("src/features/office/types.ts");
  check("types declare orchestration model", types.includes("OrchestratorRun") && types.includes("OfficeThread") && types.includes("interface Artifact"));

  const sheets = await read("src/features/office/hud/Sheets.tsx");
  check("HUD exposes synced threads/runs/artifacts",
    sheets.includes("OrchestrationView") && sheets.includes("오케스트레이션") && sheets.includes("Office threads") && sheets.includes("Artifacts"));

  const hud = await read("src/features/office/hud/Hud.tsx");
  check("HUD passes orchestration data to sheets",
    hud.includes("threads={data.threads}") && hud.includes("orchestratorRuns={data.orchestratorRuns}") && hud.includes("artifacts={data.artifacts}"));
  const panel = await read("src/features/office/hud/AgentPanel.tsx");
  check("selected agent panel shows cognition",
    hud.includes("selectedCognition") && hud.includes("cognition={selectedCognition}") && panel.includes("COGNITION") && panel.includes("CognitionRow"));

  // seed populates the office so signals render on first load.
  const domain = await read("packages/domain/src/index.mjs");
  check("demo seed populates orchestration signals",
    domain.includes("orch_eng_running") && domain.includes("thread_ops_incident") && domain.includes("art_ops_report"));

  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failures}/${results.length} projection checks passed.`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("validate-projection failed:", e);
  process.exit(1);
});
