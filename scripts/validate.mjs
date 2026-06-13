// Platform validation: seed -> run task -> approval -> approve -> audit ->
// office event -> knowledge search. Exercises the full command/policy/event/
// persistence flow through the data-store and mock office adapter.
import assert from "node:assert/strict";
import { createMemoryStore } from "../packages/data-store/src/index.mjs";
import { createMockOfficeAdapter } from "../packages/office-mattermost/src/index.mjs";
import {
  seedDemoState,
  executeCommand,
  deriveMetrics,
  projectOverview,
  projectLiveLog
} from "../packages/runtime/src/index.mjs";
import { CommandType } from "../packages/contracts/src/index.mjs";
import { Decision, evaluateTaskRun } from "../packages/policy/src/index.mjs";
import { listConnectors, buildCapabilityMap } from "../packages/connectors/src/index.mjs";
import { createKnowledgeBase, searchKnowledge, neighbors } from "../packages/knowledge/src/index.mjs";

// 1) Seed platform-shaped state.
const store = createMemoryStore(seedDemoState());
const office = createMockOfficeAdapter();
let state = await store.load();
assert.ok(state.tenant && state.workspace, "seed must produce tenant + workspace");
assert.ok(state.agents.length >= 3, "expected demo agents");
assert.ok(state.tasks.length >= 3, "expected demo tasks");

// 2) Policy: a task whose agent lacks capability must be blocked.
const lockedAgent = { capabilityGrants: [] };
const blocked = evaluateTaskRun(state.tasks[0], lockedAgent);
assert.equal(blocked.decision, Decision.block, "missing capabilities must block");

// 3) Run a non-approval task -> completes immediately.
let out = await executeCommand({ store, office, command: { type: CommandType.taskRun, taskId: "task_production_risk", requestedBy: "validation" } });
assert.equal(out.result.task.status, "completed", "production task should complete without approval");

// 4) Run an approval task -> waits for approval.
out = await executeCommand({ store, office, command: { type: CommandType.taskRun, taskId: "task_sales_followup", requestedBy: "validation" } });
const approval = out.result.approval;
assert.ok(approval, "sales task should request approval");
assert.equal(out.result.task.status, "waiting_approval", "task must wait for approval");

// 5) Approve the request -> task completes.
out = await executeCommand({ store, office, command: { type: CommandType.approvalDecide, approvalId: approval.id, decision: "approved", decidedBy: "validation" } });
assert.equal(out.result.approval.status, "approved", "approval should be approved");
assert.equal(out.result.task.status, "completed", "approved task should complete");

// 6) Reject path on the scope3 task.
out = await executeCommand({ store, office, command: { type: CommandType.taskRun, taskId: "task_scope3_gap", requestedBy: "validation" } });
const scope3Approval = out.result.approval;
out = await executeCommand({ store, office, command: { type: CommandType.approvalDecide, approvalId: scope3Approval.id, decision: "rejected", decidedBy: "validation" } });
assert.equal(out.result.task.status, "failed", "rejected task should fail");

// 7) Audit + append-only event log recorded.
state = await store.load();
assert.ok(state.auditEvents.length >= 5, "audit trail should grow");
assert.ok(state.events.length >= 6, "append-only event log should grow");
const metrics = deriveMetrics(state);
assert.ok(metrics.completedTasks >= 2, "expected completed tasks");

// 8) Office events recorded by the mock Mattermost adapter.
assert.ok(state.officeEvents.length > 0, "office adapter should record posts");
const approvalPosts = state.officeEvents.filter((p) => p.channelRef === "#approvals");
assert.ok(approvalPosts.length >= 2, "approval lifecycle should reach the office plane");

// 9) Projection used by Mission Control.
const overview = projectOverview(state, "default");
assert.equal(overview.workspace.slug, "default", "overview projects the default workspace");
assert.ok(overview.officeEvents.length > 0, "overview surfaces office events");

// 10) Connector hub manifests + capability mapping.
const connectors = listConnectors();
assert.ok(connectors.length >= 7, "expected GitHub/file/email/ERP-MES/CSV/Webhook/MCP connectors");
const capMap = buildCapabilityMap();
assert.ok(capMap["github.issue.create"]?.includes("github"), "capability map links capability -> connector");
for (const c of connectors) {
  assert.ok(!JSON.stringify(c.secretRequirements).match(/=|token_[A-Za-z0-9]{8,}/), "connectors must not embed secret values");
}

// 11) Knowledge graph search + traversal.
const kb = createKnowledgeBase(state.workspace.id);
assert.ok(kb.documents.length >= 3 && kb.nodes.length >= 4 && kb.edges.length >= 3, "knowledge graph should have demo content");
const hits = searchKnowledge(kb, "납기 위험 Line 2");
assert.ok(hits.length > 0, "knowledge search should find risk content");
const line2 = kb.nodes.find((n) => n.title === "Line 2");
assert.ok(neighbors(kb, line2.id).some((n) => n.relation === "has_risk"), "graph traversal should resolve relations");

// 12) Live Operations Log projection merges all four activity planes, ordered.
const liveLog = projectLiveLog(state, "default");
assert.ok(liveLog.entries.length > 0, "live log should project entries after activity");
const liveSources = new Set(liveLog.entries.map((e) => e.source));
assert.ok(liveSources.has("agent") && liveSources.has("runtime"), "live log should include agent + runtime planes");
for (let i = 1; i < liveLog.entries.length; i += 1) {
  assert.ok(liveLog.entries[i - 1].ts >= liveLog.entries[i].ts, "live log must be newest-first ordered");
}
// Running another task must grow the live log (client sees activity stream).
const beforeLive = projectLiveLog(await store.load(), "default").entries.length;
await executeCommand({ store, office, command: { type: CommandType.taskRun, taskId: "task_production_risk", requestedBy: "validation" } });
const afterLive = projectLiveLog(await store.load(), "default").entries.length;
assert.ok(afterLive > beforeLive, "live log should grow after a task run");

console.log(JSON.stringify({
  ok: true,
  agents: state.agents.length,
  tasks: state.tasks.length,
  taskRuns: state.taskRuns.length,
  completedTasks: metrics.completedTasks,
  events: state.events.length,
  auditEvents: state.auditEvents.length,
  officeEvents: state.officeEvents.length,
  connectors: connectors.length,
  knowledgeHits: hits.length,
  liveLogEntries: afterLive
}, null, 2));
