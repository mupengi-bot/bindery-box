// BINDERY BOX — Vercel serverless Control Plane.
//
// One function that mirrors apps/api/server.mjs route-for-route, but built for
// a serverless platform with NO writable filesystem:
//
//   * If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set -> hosted Supabase
//     store (persistent across requests).
//   * Otherwise -> stateless demo mode: an in-memory store seeded with demo
//     state, shared only within a warm instance and reseeded on cold start.
//
// Routing is factored into a pure `handleRequest({...}) -> { status, body }`
// so it can be exercised function-level (no HTTP) by scripts/validate-cloud.mjs.
import { createCloudStore, describeStoreBackend } from "../packages/data-store/src/index.mjs";
import { createMockOfficeAdapter } from "../packages/office-mattermost/src/index.mjs";
import {
  CommandType,
  seedDemoState,
  deriveMetrics,
  executeCommand,
  projectOverview
} from "../packages/runtime/src/index.mjs";
import { listConnectors, buildCapabilityMap } from "../packages/connectors/src/index.mjs";
import { createKnowledgeBase, searchKnowledge } from "../packages/knowledge/src/index.mjs";

// Module-scoped store: persists across warm invocations, reseeds on cold start.
let sharedStore = null;
function defaultStore() {
  if (!sharedStore) sharedStore = createCloudStore({ seedFactory: seedDemoState });
  return sharedStore;
}

// Fresh mock office adapter per command; posts are persisted into state.
const office = () => createMockOfficeAdapter();

// Normalise a pathname so both "/api/foo" (Vercel rewrite preserves the
// original URL) and bare "/foo" resolve to the same route.
function normalisePath(pathname) {
  if (pathname.length > 4 && pathname.startsWith("/api/")) return pathname.slice(4);
  if (pathname === "/api") return "/";
  return pathname;
}

// Pure, transport-agnostic router. Returns { status, body }.
export async function handleRequest({
  method = "GET",
  pathname = "/",
  searchParams = new URLSearchParams(),
  body = {},
  store = defaultStore()
} = {}) {
  const route = normalisePath(pathname);

  if (method === "OPTIONS") return { status: 204, body: {} };

  if (route === "/health" || route === "/") {
    return {
      status: 200,
      body: {
        ok: true,
        service: "bindery-api",
        runtime: "vercel-serverless",
        store: describeStoreBackend()
      }
    };
  }

  // --- demo seed (namespaced + legacy) ---
  if (method === "POST" && (route === "/demo/seed")) {
    const state = await store.save(seedDemoState());
    return { status: 200, body: { ok: true, state } };
  }

  // --- platform projection endpoints ---
  const overviewMatch = route.match(/^\/workspaces\/([^/]+)\/overview$/);
  if (method === "GET" && overviewMatch) {
    return { status: 200, body: projectOverview(await store.load(), overviewMatch[1]) };
  }
  const wsTasksMatch = route.match(/^\/workspaces\/([^/]+)\/tasks$/);
  if (method === "GET" && wsTasksMatch) {
    return { status: 200, body: { tasks: projectOverview(await store.load(), wsTasksMatch[1]).tasks } };
  }
  const wsApprovalsMatch = route.match(/^\/workspaces\/([^/]+)\/approvals$/);
  if (method === "GET" && wsApprovalsMatch) {
    return { status: 200, body: { approvals: projectOverview(await store.load(), wsApprovalsMatch[1]).approvals } };
  }
  const wsAuditMatch = route.match(/^\/workspaces\/([^/]+)\/audit-events$/);
  if (method === "GET" && wsAuditMatch) {
    const state = await store.load();
    return {
      status: 200,
      body: { auditEvents: state.auditEvents.slice(0, 50), officeEvents: (state.officeEvents ?? []).slice(-50).reverse() }
    };
  }

  // --- connector hub ---
  if (method === "GET" && route === "/connectors") {
    return { status: 200, body: { connectors: listConnectors(), capabilityMap: buildCapabilityMap() } };
  }

  // --- knowledge graph ---
  if (method === "GET" && route === "/knowledge/search") {
    const state = await store.load();
    const kb = createKnowledgeBase(state.workspace?.id ?? "ws_default");
    const q = searchParams.get("q") ?? "";
    return { status: 200, body: { query: q, results: searchKnowledge(kb, q) } };
  }
  if (method === "GET" && route === "/knowledge") {
    const state = await store.load();
    const kb = createKnowledgeBase(state.workspace?.id ?? "ws_default");
    return { status: 200, body: { documents: kb.documents.length, nodes: kb.nodes, edges: kb.edges } };
  }

  // --- platform command endpoints ---
  const runMatch = route.match(/^\/tasks\/([^/]+)\/run$/);
  if (method === "POST" && runMatch) {
    const outcome = await executeCommand({
      store,
      command: { type: CommandType.taskRun, taskId: runMatch[1], requestedBy: body.requestedBy ?? "operator" },
      office: office()
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const decisionMatch = route.match(/^\/approvals\/([^/]+)\/decision$/);
  if (method === "POST" && decisionMatch) {
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
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  // --- legacy read surface (kept for compatibility) ---
  const state = await store.load();
  if (method === "GET" && route === "/state") return { status: 200, body: { ...state, metrics: deriveMetrics(state) } };
  if (method === "GET" && route === "/agents") return { status: 200, body: { agents: state.agents } };
  if (method === "GET" && route === "/tasks") return { status: 200, body: { tasks: state.tasks } };
  if (method === "GET" && route === "/approvals") return { status: 200, body: { approvals: state.approvals } };
  if (method === "GET" && route === "/audit-events") return { status: 200, body: { auditEvents: state.auditEvents } };

  return { status: 404, body: { ok: false, error: "Not found", route } };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return {}; }
}

// Vercel Node serverless entrypoint.
export default async function handler(req, res) {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers?.host ?? "localhost"}`);
    const out = await handleRequest({
      method: req.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      body: req.method === "POST" ? await readBody(req) : {}
    });
    res.statusCode = out.status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    res.end(JSON.stringify(out.body, null, 2));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
}
