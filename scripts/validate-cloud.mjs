// Cloud target validation — drives the Vercel serverless handler at the
// FUNCTION level (no HTTP server, no network). Imports the pure router
// `handleRequest` from api/index.mjs and a fresh injected store, then walks the
// full demo flow: health -> overview -> connectors -> knowledge -> run ->
// approval. This proves the serverless surface works in stateless demo mode
// before anything is deployed to Vercel.
import assert from "node:assert/strict";
import { handleRequest } from "../api/index.mjs";
import { createCloudStore } from "../packages/data-store/src/index.mjs";
import { seedDemoState } from "../packages/runtime/src/index.mjs";

// Fresh stateless-demo store (no SUPABASE_* env => in-memory seeded store).
const store = createCloudStore({ seedFactory: seedDemoState, env: {} });
const call = (method, pathname, { q, body } = {}) =>
  handleRequest({
    method,
    pathname,
    searchParams: new URLSearchParams(q ? { q } : {}),
    body: body ?? {},
    store
  });

// 1) Health reports the serverless runtime + stateless-demo backend.
let r = await call("GET", "/api/health");
assert.equal(r.status, 200, "health 200");
assert.equal(r.body.ok, true, "health ok");
assert.equal(r.body.store.backend, "memory", "no supabase env -> memory backend");
assert.equal(r.body.store.mode, "stateless-demo", "stateless demo mode");

// 2) Overview projection is reachable through the cloud handler.
r = await call("GET", "/api/workspaces/default/overview");
assert.equal(r.status, 200, "overview 200");
assert.ok(r.body.agents.length >= 3, "overview surfaces demo agents");
assert.ok(r.body.tasks.length >= 3, "overview surfaces demo tasks");
assert.ok(r.body.metrics, "overview includes metrics");

// 3) Connector hub manifests + capability map.
r = await call("GET", "/api/connectors");
assert.equal(r.status, 200, "connectors 200");
assert.ok(r.body.connectors.length >= 7, "expected >=7 connectors");
assert.ok(r.body.capabilityMap["github.issue.create"]?.includes("github"), "capability map links capability -> connector");

// 4) Knowledge graph search.
r = await call("GET", "/api/knowledge/search", { q: "납기 위험 Line 2" });
assert.equal(r.status, 200, "knowledge search 200");
assert.ok(r.body.results.length > 0, "knowledge search returns hits");

// 5) Run a task that needs approval -> waits for approval.
r = await call("POST", "/api/tasks/task_sales_followup/run", { body: { requestedBy: "cloud-validation" } });
assert.equal(r.status, 200, "run 200");
assert.equal(r.body.ok, true, "run ok");
const approval = r.body.result.approval;
assert.ok(approval, "sales task should create an approval");
assert.equal(r.body.result.task.status, "waiting_approval", "task must wait for approval");

// 6) Approve the request through the cloud handler -> task completes.
r = await call("POST", `/api/approvals/${approval.id}/decision`, { body: { decision: "approved", decidedBy: "cloud-validation" } });
assert.equal(r.status, 200, "decision 200");
assert.equal(r.body.result.approval.status, "approved", "approval approved");
assert.equal(r.body.result.task.status, "completed", "approved task completed");

// 7) A task that runs without approval completes immediately (stateful within instance).
r = await call("POST", "/api/tasks/task_production_risk/run", { body: { requestedBy: "cloud-validation" } });
assert.equal(r.body.result.task.status, "completed", "production task completes without approval");

// 8) State persisted within the warm instance: overview reflects the completed work.
r = await call("GET", "/api/workspaces/default/overview");
assert.ok(r.body.metrics.completedTasks >= 2, "completed tasks visible after runs");
assert.ok(r.body.officeEvents.length > 0, "office events projected into overview");

// 9) Live Operations Log reachable through the cloud handler + grows on activity.
r = await call("GET", "/api/workspaces/default/live-log");
assert.equal(r.status, 200, "live-log 200");
assert.ok(Array.isArray(r.body.entries) && r.body.entries.length > 0, "live-log returns entries");
const liveBefore = r.body.entries.length;
await call("POST", "/api/tasks/task_production_risk/run", { body: { requestedBy: "cloud-validation" } });
r = await call("GET", "/api/workspaces/default/live-log");
assert.ok(r.body.entries.length >= liveBefore, "live-log reflects new activity");

// 10) Both /api-prefixed and bare live-log routes resolve (Vercel rewrite parity).
r = await call("GET", "/workspaces/default/live-log");
assert.equal(r.status, 200, "bare live-log route 200");

// 10b) Workstream projection (AI company simulator) reachable through cloud handler.
r = await call("GET", "/api/workspaces/default/workstream");
assert.equal(r.status, 200, "workstream 200");
assert.ok(r.body.company && typeof r.body.company.healthScore === "number", "workstream exposes company health");
assert.ok(r.body.missions.length >= 3, "workstream surfaces missions");
assert.ok(r.body.agents.every((a) => typeof a.energy === "number"), "workstream agents carry energy");
assert.ok(r.body.stream.length > 0, "workstream has narrative beats after activity");
assert.ok(r.body.kpis.every((k) => Array.isArray(k.spark)), "workstream kpis carry sparklines");
// Bare route parity (Vercel rewrite).
r = await call("GET", "/workspaces/default/workstream");
assert.equal(r.status, 200, "bare workstream route 200");

// 11) Unknown route -> 404 (defensive).
r = await call("GET", "/api/nope");
assert.equal(r.status, 404, "unknown route 404");

console.log(JSON.stringify({
  ok: true,
  surface: "vercel-serverless (function-level)",
  storeBackend: r.body ? "memory" : "memory",
  completedTasks: (await call("GET", "/api/workspaces/default/overview")).body.metrics.completedTasks,
  checks: [
    "health", "overview", "connectors", "knowledge", "run", "approval", "live-log", "stateless-demo"
  ]
}, null, 2));
