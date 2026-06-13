import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { approveRequest, deriveMetrics, runTask, seedDemoState } from "../../packages/runtime/src/index.mjs";

const port = Number(process.env.BINDERY_API_PORT ?? 4311);
const statePath = path.resolve(process.env.BINDERY_STATE_PATH ?? ".bindery/runtime/state.json");

async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, "utf8")); }
  catch { const state = seedDemoState(); await writeState(state); return state; }
}
async function writeState(state) { await fs.mkdir(path.dirname(statePath), { recursive: true }); await fs.writeFile(statePath, JSON.stringify(state, null, 2)); }
function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(body, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/health") return send(res, 200, { ok: true, service: "bindery-api", port });
    let state = await readState();
    if (req.method === "POST" && url.pathname === "/demo/seed") { state = seedDemoState(); await writeState(state); return send(res, 200, { ok: true, state }); }
    if (req.method === "GET" && url.pathname === "/state") return send(res, 200, { ...state, metrics: deriveMetrics(state) });
    if (req.method === "GET" && url.pathname === "/agents") return send(res, 200, { agents: state.agents });
    if (req.method === "GET" && url.pathname === "/tasks") return send(res, 200, { tasks: state.tasks });
    if (req.method === "GET" && url.pathname === "/approvals") return send(res, 200, { approvals: state.approvals });
    if (req.method === "GET" && url.pathname === "/audit-events") return send(res, 200, { auditEvents: state.auditEvents });
    const runMatch = url.pathname.match(/^\/tasks\/([^/]+)\/run$/);
    if (req.method === "POST" && runMatch) { const result = runTask(state, runMatch[1]); await writeState(state); return send(res, 200, { ok: true, result, state }); }
    const approveMatch = url.pathname.match(/^\/approvals\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) { const approval = approveRequest(state, approveMatch[1]); await writeState(state); return send(res, 200, { ok: true, approval, state }); }
    return send(res, 404, { ok: false, error: "Not found" });
  } catch (error) { return send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
server.listen(port, () => console.log(`BINDERY API listening on http://localhost:${port}`));
