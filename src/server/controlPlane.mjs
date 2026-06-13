// BINDERY BOX — Control Plane router (business core).
//
// A pure, transport-agnostic router shared by every Next API route. It mirrors
// the original Vercel serverless surface so the platform's meaning is preserved
// after the migration onto the Claw3D-style 3D office front end.
//
//   * If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set -> hosted Supabase
//     store (persistent across requests).
//   * Otherwise -> stateless demo mode: an in-memory store seeded with demo
//     state, shared only within a warm instance and reseeded on cold start.
//
// `handleRequest({...}) -> { status, body }` has no HTTP dependency so it can be
// exercised function-level by scripts/validate-core.mjs and reused by every
// Next route handler.
import { createCloudStore, describeStoreBackend } from "../../packages/data-store/src/index.mjs";
import { createMockOfficeAdapter } from "../../packages/office-mattermost/src/index.mjs";
import {
  CommandType,
  seedDemoState,
  deriveMetrics,
  executeCommand,
  projectOverview,
  projectLiveLog,
  projectWorkstream,
} from "../../packages/runtime/src/index.mjs";
import { listConnectors, buildCapabilityMap } from "../../packages/connectors/src/index.mjs";
import { createKnowledgeBase, searchKnowledge } from "../../packages/knowledge/src/index.mjs";
import { getGoldenImage, projectGoldenImage } from "../../packages/golden-image/src/index.mjs";

// Module-scoped store: persists across warm invocations, reseeds on cold start.
let sharedStore = null;
function defaultStore() {
  if (!sharedStore) sharedStore = createCloudStore({ seedFactory: seedDemoState });
  return sharedStore;
}

// Fresh mock office adapter per command; posts are persisted into state.
const office = () => createMockOfficeAdapter();

// Normalise so "/api/foo" and bare "/foo" resolve to the same route.
function normalisePath(pathname) {
  if (pathname.length > 4 && pathname.startsWith("/api/")) return pathname.slice(4);
  if (pathname === "/api") return "/";
  return pathname;
}

export async function handleRequest({
  method = "GET",
  pathname = "/",
  searchParams = new URLSearchParams(),
  body = {},
  store = defaultStore(),
} = {}) {
  const route = normalisePath(pathname);

  if (method === "OPTIONS") return { status: 204, body: {} };

  if (route === "/health" || route === "/") {
    return {
      status: 200,
      body: {
        ok: true,
        service: "bindery-box",
        product: "BINDERY BOX / MUFI Box",
        surface: "claw3d-3d-office",
        runtime: "next-route-handler",
        store: describeStoreBackend(),
      },
    };
  }

  // --- demo seed (namespaced + legacy) ---
  if (method === "POST" && route === "/demo/seed") {
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
      body: { auditEvents: state.auditEvents.slice(0, 50), officeEvents: (state.officeEvents ?? []).slice(-50).reverse() },
    };
  }
  const wsLiveLogMatch = route.match(/^\/workspaces\/([^/]+)\/live-log$/);
  if (method === "GET" && wsLiveLogMatch) {
    return { status: 200, body: projectLiveLog(await store.load(), wsLiveLogMatch[1]) };
  }
  const wsWorkstreamMatch = route.match(/^\/workspaces\/([^/]+)\/workstream$/);
  if (method === "GET" && wsWorkstreamMatch) {
    return { status: 200, body: projectWorkstream(await store.load(), wsWorkstreamMatch[1]) };
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

  // --- golden image (core product identity) ---
  // Canonical, static manifest: the planes / UX layers / invariants that define
  // the product identity behind the Claw3D office.
  if (method === "GET" && route === "/golden-image") {
    return { status: 200, body: getGoldenImage() };
  }
  // Per-workspace projection: the same manifest with live, public-safe runtime
  // signals overlaid per plane so the 3D office HUD can render what is running.
  const goldenMatch = route.match(/^\/workspaces\/([^/]+)\/golden-image$/);
  if (method === "GET" && goldenMatch) {
    const state = await store.load();
    const projection = projectGoldenImage({
      workspaceId: goldenMatch[1],
      generatedAt: new Date().toISOString(),
      metrics: deriveMetrics(state),
      signals: { connectors: listConnectors().length, store: describeStoreBackend().backend },
    });
    return { status: 200, body: projection };
  }

  // --- platform command endpoints ---
  const runMatch = route.match(/^\/tasks\/([^/]+)\/run$/);
  if (method === "POST" && runMatch) {
    const outcome = await executeCommand({
      store,
      command: { type: CommandType.taskRun, taskId: runMatch[1], requestedBy: body.requestedBy ?? "operator" },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const agentCreateMatch = route.match(/^\/workspaces\/([^/]+)\/agents$/);
  if (method === "POST" && agentCreateMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.agentCreate,
        workspaceId: agentCreateMatch[1],
        name: body.name ?? "New Agent",
        role: body.role ?? "AI 직원",
        lane: body.lane ?? "control",
        persona: body.persona,
        prompt: body.prompt,
        capabilities: body.capabilities,
        kpi: body.kpi,
        requestedBy: body.requestedBy ?? "operator",
      },
      office: office(),
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
        decidedBy: body.decidedBy ?? "operator",
      },
      office: office(),
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
