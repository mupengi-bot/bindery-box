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

  // 5) knowledge search
  const know = await handleRequest({ method: "GET", pathname: "/api/knowledge/search", searchParams: new URLSearchParams({ q: "납기" }) });
  check("GET knowledge/search → results[]", know.status === 200 && Array.isArray(know.body.results));

  // 6) task run + approval flow — pick a runnable mission from the workstream
  const runnable = ws.body.missions.find((m) => m.runnable);
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
