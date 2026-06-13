import { seedDemoState, runTask, approveRequest, deriveMetrics } from "../packages/runtime/src/index.mjs";

const state = seedDemoState();
if (state.agents.length < 3) throw new Error("expected demo agents");
if (state.tasks.length < 3) throw new Error("expected demo tasks");
const first = runTask(state, "task_production_risk");
if (first.task.status !== "completed") throw new Error("production task should complete without approval");
const second = runTask(state, "task_sales_followup");
if (!second.approval) throw new Error("sales task should request approval");
approveRequest(state, second.approval.id, "validation");
const metrics = deriveMetrics(state);
if (metrics.completedTasks < 2) throw new Error("expected completed tasks after approval");
console.log(JSON.stringify({ ok: true, agents: state.agents.length, tasks: state.tasks.length, completedTasks: metrics.completedTasks, auditEvents: state.auditEvents.length }, null, 2));
