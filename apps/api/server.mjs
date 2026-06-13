// BINDERY BOX Control Plane API.
// Exposes platform projection endpoints (/api/workspaces/:id/overview, ...)
// and command endpoints, while keeping the legacy /state surface working.
import * as http from "node:http";
import { createFileStore } from "../../packages/data-store/src/index.mjs";
import { createMockOfficeAdapter } from "../../packages/office-mattermost/src/index.mjs";
import {
  CommandType,
  seedDemoState,
  deriveMetrics,
  executeCommand,
  projectOverview
} from "../../packages/runtime/src/index.mjs";
import { listConnectors, buildCapabilityMap } from "../../packages/connectors/src/index.mjs";
import { createKnowledgeBase, searchKnowledge } from "../../packages/knowledge/src/index.mjs";

const port = Number(process.env.BINDERY_API_PORT ?? 4311);
const statePath = process.env.BINDERY_STATE_PATH ?? ".bindery/runtime/state.json";
const store = createFileStore(statePath, seedDemoState);

function send(res, code, body) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

// Fresh mock office adapter per command; posts are persisted into state.
const office = () => createMockOfficeAdapter();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const { pathname } = url;

    if (pathname === "/health") return send(res, 200, { ok: true, service: "bindery-api", port });

    // --- demo seed (both legacy and namespaced) ---
    if (req.method === "POST" && (pathname === "/demo/seed" || pathname === "/api/demo/seed")) {
      const state = await store.save(seedDemoState());
      return send(res, 200, { ok: true, state });
    }

    // --- platform projection endpoints ---
    const overviewMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/overview$/);
    if (req.method === "GET" && overviewMatch) {
      return send(res, 200, projectOverview(await store.load(), overviewMatch[1]));
    }
    const wsTasksMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/tasks$/);
    if (req.method === "GET" && wsTasksMatch) {
      return send(res, 200, { tasks: projectOverview(await store.load(), wsTasksMatch[1]).tasks });
    }
    const wsApprovalsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/approvals$/);
    if (req.method === "GET" && wsApprovalsMatch) {
      return send(res, 200, { approvals: projectOverview(await store.load(), wsApprovalsMatch[1]).approvals });
    }
    const wsAuditMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/audit-events$/);
    if (req.method === "GET" && wsAuditMatch) {
      const state = await store.load();
      return send(res, 200, { auditEvents: state.auditEvents.slice(0, 50), officeEvents: (state.officeEvents ?? []).slice(-50).reverse() });
    }

    // --- connector hub ---
    if (req.method === "GET" && pathname === "/api/connectors") {
      return send(res, 200, { connectors: listConnectors(), capabilityMap: buildCapabilityMap() });
    }

    // --- knowledge graph ---
    if (req.method === "GET" && pathname === "/api/knowledge/search") {
      const state = await store.load();
      const kb = createKnowledgeBase(state.workspace?.id ?? "ws_default");
      const q = url.searchParams.get("q") ?? "";
      return send(res, 200, { query: q, results: searchKnowledge(kb, q) });
    }
    if (req.method === "GET" && pathname === "/api/knowledge") {
      const state = await store.load();
      const kb = createKnowledgeBase(state.workspace?.id ?? "ws_default");
      return send(res, 200, { documents: kb.documents.length, nodes: kb.nodes, edges: kb.edges });
    }

    // --- platform command endpoints ---
    const runMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/) || pathname.match(/^\/tasks\/([^/]+)\/run$/);
    if (req.method === "POST" && runMatch) {
      const body = await readBody(req);
      const outcome = await executeCommand({
        store,
        command: { type: CommandType.taskRun, taskId: runMatch[1], requestedBy: body.requestedBy ?? "operator" },
        office: office()
      });
      return send(res, 200, { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state });
    }

    const decisionMatch = pathname.match(/^\/api\/approvals\/([^/]+)\/decision$/);
    if (req.method === "POST" && decisionMatch) {
      const body = await readBody(req);
      const outcome = await executeCommand({
        store,
        command: {
          type: CommandType.approvalDecide,
          approvalId: decisionMatch[1],
          decision: body.decision ?? "approved",
          decidedBy: body.decidedBy ?? "operator"
        },
        office: office()
      });
      return send(res, 200, { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state });
    }

    // legacy approve endpoint -> approved decision
    const approveMatch = pathname.match(/^\/approvals\/([^/]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const outcome = await executeCommand({
        store,
        command: { type: CommandType.approvalDecide, approvalId: approveMatch[1], decision: "approved", decidedBy: "operator" },
        office: office()
      });
      return send(res, 200, { ok: outcome.ok, approval: outcome.result.approval, state: outcome.state });
    }

    // --- legacy read surface (kept for compatibility) ---
    const state = await store.load();
    if (req.method === "GET" && pathname === "/state") return send(res, 200, { ...state, metrics: deriveMetrics(state) });
    if (req.method === "GET" && pathname === "/agents") return send(res, 200, { agents: state.agents });
    if (req.method === "GET" && pathname === "/tasks") return send(res, 200, { tasks: state.tasks });
    if (req.method === "GET" && pathname === "/approvals") return send(res, 200, { approvals: state.approvals });
    if (req.method === "GET" && pathname === "/audit-events") return send(res, 200, { auditEvents: state.auditEvents });

    return send(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    return send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, () => console.log(`BINDERY API listening on http://localhost:${port}`));
