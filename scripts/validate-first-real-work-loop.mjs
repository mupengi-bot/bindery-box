#!/usr/bin/env node
// Validates the product-critical loop:
// Goal Composer -> Plan Preview -> explicit execute -> runtime run/log/artifact/approval -> projections.
import { handleRequest } from "../src/server/controlPlane.mjs";
import { createMemoryStore } from "../packages/data-store/src/index.mjs";
import { seedDemoState } from "../packages/runtime/src/index.mjs";

const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`✓ ${name}`);
    return;
  }
  failures.push(name);
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const store = createMemoryStore(seedDemoState());

const preview = await handleRequest({
  method: "POST",
  pathname: "/api/workspaces/default/plan-preview",
  body: {
    title: "이번 주 포토부스 문의 정리하고 견적 초안 만들어줘",
    lane: "operations",
    requestedBy: "operator",
  },
  store,
});
check("goal -> plan preview returns assigned operations plan", preview.status === 200 && preview.body.preview?.lane === "operations" && preview.body.preview.assignedAgentId);
check("plan preview includes explicit execution requirements", Array.isArray(preview.body.preview?.steps) && preview.body.preview.steps.length >= 3 && Array.isArray(preview.body.preview?.expectedArtifacts));

const execute = await handleRequest({
  method: "POST",
  pathname: "/api/workspaces/default/tasks",
  body: {
    title: preview.body.preview.title,
    lane: preview.body.preview.lane,
    expectedOutput: preview.body.preview.expectedArtifacts.join(" · "),
    requiresApproval: preview.body.preview.approvals.some((a) => a.required),
    enqueue: true,
    execute: true,
    requestedBy: "operator",
  },
  store,
});
const exec = execute.body.result?.planExecution ?? {};
check("explicit execute creates a task and crosses runtime boundary", execute.status === 200 && execute.body.ok && exec.orchestratorRun?.id && exec.task?.id);
check("execute produces an office-visible artifact", Boolean(exec.artifact?.visibleInOffice && exec.artifact?.sourceRunId === exec.orchestratorRun.id));

const log = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/live-log", store });
check("live-log shows runtime queue/start/stream/completion", log.status === 200 && log.body.entries.some((e) => e.action === "agent.run.queued") && log.body.entries.some((e) => e.action === "agent.run.completed"));

const workstream = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream", store });
check("workstream mission card is completed with artifact summary", workstream.status === 200 && workstream.body.missions.some((m) => m.taskId === exec.task?.id && m.status === "completed" && /산출물/.test(m.summary ?? "")));
check("3D projection receives active run/artifact signals", workstream.body.agents.some((a) => a.id === exec.agent?.id) && log.body.entries.length > 0);

const approvalPreview = await handleRequest({
  method: "POST",
  pathname: "/api/workspaces/default/plan-preview",
  body: { title: "계약서 위험 조항 검토하고 고객 발송 전 승인 요청해줘", lane: "legal", requestedBy: "operator" },
  store,
});
const approvalExecute = await handleRequest({
  method: "POST",
  pathname: "/api/workspaces/default/tasks",
  body: {
    title: approvalPreview.body.preview.title,
    lane: approvalPreview.body.preview.lane,
    expectedOutput: approvalPreview.body.preview.expectedArtifacts.join(" · "),
    requiresApproval: approvalPreview.body.preview.approvals.some((a) => a.required),
    enqueue: true,
    execute: true,
    requestedBy: "operator",
  },
  store,
});
const approvalExec = approvalExecute.body.result?.planExecution ?? {};
check("approval-bound work stops at Human Gate", approvalExecute.status === 200 && approvalExec.approval?.status === "pending" && approvalExec.task?.status === "waiting_approval");
check("approval-bound work still creates an office-visible approval packet", Boolean(approvalExec.artifact?.visibleInOffice && approvalExec.orchestratorRun?.artifactId === approvalExec.artifact?.id));

const artifactRes = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/artifacts", store });
check("artifact endpoint exposes both result and approval packet", artifactRes.status === 200 && artifactRes.body.artifacts.some((a) => a.id === exec.artifact?.id) && artifactRes.body.artifacts.some((a) => a.id === approvalExec.artifact?.id));

if (failures.length) {
  console.error(`\n${failures.length} first-real-work-loop check(s) failed.`);
  process.exit(1);
}
console.log("\nFirst Real Work Loop checks passed.");
