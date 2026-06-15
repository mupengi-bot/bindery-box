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
import { randomUUID } from "node:crypto";
import { createCloudStore, describeStoreBackend } from "../../packages/data-store/src/index.mjs";
import { createMockOfficeAdapter } from "../../packages/office-mattermost/src/index.mjs";
import {
  CommandType,
  seedDemoState,
  deriveMetrics,
  executeCommand,
  projectOverview,
  projectAccessTopology,
  projectLiveLog,
  projectWorkstream,
  buildPlanPreview,
} from "../../packages/runtime/src/index.mjs";
import { listConnectors, buildCapabilityMap } from "../../packages/connectors/src/index.mjs";
import { createKnowledgeBase, searchKnowledge } from "../../packages/knowledge/src/index.mjs";
import { getGoldenImage, projectGoldenImage } from "../../packages/golden-image/src/index.mjs";
import { buildLocalDeviceManifest, buildDeviceAccessPolicy, createWorkspaceScope, projectWorkspaceScopes, listWorkspaceFiles, previewWorkspaceFile, buildFileWriteApproval, applyApprovedFileWrite, buildTerminalRunApproval, applyApprovedTerminalRun, buildBrowserOpenApproval, applyApprovedBrowserOpen } from "../../packages/local-device/src/index.mjs";
import { listRoleTemplates } from "../../packages/domain/src/index.mjs";

// Module-scoped store: persists across warm invocations, reseeds on cold start.
let sharedStore = null;
function defaultStore() {
  if (!sharedStore) sharedStore = createCloudStore({ seedFactory: seedDemoState });
  return sharedStore;
}

// Fresh mock office adapter per command; posts are persisted into state.
const office = () => createMockOfficeAdapter();

function headerValue(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(key) ?? "";
  return headers[key] ?? headers[key.toLowerCase()] ?? "";
}

function sessionTokenFromHeaders(headers) {
  const auth = headerValue(headers, "authorization");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = headerValue(headers, "cookie");
  const match = String(cookie).match(/(?:^|;\s*)bindery_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, workspaceId: user.workspaceId, displayName: user.displayName, role: user.role, status: user.status };
}

function projectDiagnostics(state, workspaceId = "default") {
  const wsId = workspaceId === "default" ? (state.workspace?.id ?? "ws_default") : workspaceId;
  const scopes = projectWorkspaceScopes(state, { workspaceId: wsId });
  const tasks = state.tasks ?? [];
  const approvals = state.approvals ?? [];
  const events = state.auditEvents ?? [];
  const runs = state.orchestratorRuns ?? [];
  const mem = typeof process.memoryUsage === "function" ? process.memoryUsage() : {};
  const backend = describeStoreBackend();
  const checks = [
    { id: "runtime", label: "Local runtime", status: "ok", detail: "Next route handler reachable" },
    { id: "store", label: "Persistent store", status: backend.persistent ? "ok" : "warn", detail: `${backend.backend}${backend.persistent ? " persistent" : " memory-only"}` },
    { id: "local-device", label: "Local Device Plane", status: "ok", detail: `${scopes.length} workspace scope(s)` },
    { id: "approvals", label: "Human Gate", status: approvals.some((item) => item.status === "pending") ? "warn" : "ok", detail: `${approvals.filter((item) => item.status === "pending").length} pending approval(s)` },
    { id: "live-log", label: "Live Operations Log", status: events.length ? "ok" : "warn", detail: `${events.length} audit event(s)` },
    { id: "console", label: "Internal Console", status: "ok", detail: "diagnostics projection active" }
  ];
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    workspaceId: wsId,
    runtime: {
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: {
        rss: Math.round((mem.rss ?? 0) / 1024 / 1024),
        heapUsed: Math.round((mem.heapUsed ?? 0) / 1024 / 1024),
        heapTotal: Math.round((mem.heapTotal ?? 0) / 1024 / 1024)
      }
    },
    store: backend,
    counters: {
      agents: (state.agents ?? []).length,
      tasks: tasks.length,
      runnableTasks: tasks.filter((task) => task.status !== "completed").length,
      approvals: approvals.length,
      pendingApprovals: approvals.filter((item) => item.status === "pending").length,
      artifacts: (state.artifacts ?? []).length,
      runs: runs.length,
      activeRuns: runs.filter((run) => ["planned", "running", "waiting_approval"].includes(String(run.status))).length,
      auditEvents: events.length,
      workspaceScopes: scopes.length
    },
    features: [
      { id: "plan-preview", label: "Plan Preview", status: "implemented", endpoint: "/api/workspaces/default/plan-preview" },
      { id: "first-work-loop", label: "First Work Loop", status: "implemented", endpoint: "/api/tasks/:id/run" },
      { id: "folder-grant", label: "Folder Grant", status: "implemented", endpoint: "/api/workspaces/default/local-device/scopes" },
      { id: "file-preview", label: "File Preview", status: "implemented", endpoint: "/api/workspaces/default/local-device/preview" },
      { id: "file-write", label: "File Write via Human Gate", status: "implemented", endpoint: "/api/workspaces/default/local-device/files/write" },
      { id: "terminal", label: "Terminal via Human Gate", status: "implemented", endpoint: "/api/workspaces/default/local-device/terminal/run" },
      { id: "browser", label: "Browser Gate", status: "implemented", endpoint: "/api/workspaces/default/local-device/browser/open" },
      { id: "office", label: "3D Office Projection", status: "implemented", endpoint: "/office" }
    ],
    skillStatus: [
      { id: "desktop-local-device", label: "Desktop local-device execution slice", status: "loaded-into-product", detail: "folder/file/terminal/browser approval loop" },
      { id: "systematic-debugging", label: "Systematic debugging", status: "used-this-session", detail: "root cause before fixes" },
      { id: "mufi-platform", label: "MUFI/BINDERY platform workflow", status: "used-this-session", detail: "desktop packaging and local execution pattern" }
    ],
    checks,
    recentEvents: events.slice(0, 12).map((event) => ({
      id: event.id,
      ts: event.ts ?? event.createdAt,
      actor: event.actor,
      action: event.action,
      message: event.message,
      target: event.target
    }))
  };
}

function setupStatus(state) {
  const tasks = state.tasks ?? [];
  const firstWorkItem = tasks.find((task) => task.id === "task_first_work_order") ?? tasks[0] ?? null;
  const publicUrl = process.env.BINDERY_PUBLIC_URL ?? "http://localhost:3000";
  const officeUrl = process.env.BINDERY_PUBLIC_OFFICE_URL ?? process.env.BINDERY_MATTERMOST_URL ?? "http://localhost:8065";
  return {
    ready: Boolean(state.workspace && firstWorkItem && (state.humanUsers ?? []).some((user) => user.role === "owner")),
    workspace: { id: state.workspace?.id ?? "default", name: state.workspace?.name ?? "BINDERY Workspace" },
    owner: publicUser((state.humanUsers ?? []).find((user) => user.role === "owner")),
    links: {
      missionControl: publicUrl,
      humanOffice: officeUrl,
      firstWorkItem: `${publicUrl}/?focus=${firstWorkItem?.id ?? "workstream"}`
    },
    firstWorkItem: firstWorkItem ? {
      id: firstWorkItem.id,
      title: firstWorkItem.title,
      lane: firstWorkItem.lane,
      priority: firstWorkItem.priority,
      assignedAgentId: firstWorkItem.assignedAgentId,
      expectedOutput: firstWorkItem.expectedOutput
    } : null,
    checks: {
      ownerSeeded: (state.humanUsers ?? []).some((user) => user.role === "owner"),
      routesReady: (state.accessRoutes ?? []).filter((route) => route.status === "ready").length,
      hardwareNodes: (state.hardwareNodes ?? []).length,
      agents: (state.agents ?? []).length,
      tasks: tasks.length,
      threads: (state.threads ?? []).length,
      sessions: (state.sessions ?? []).length,
      store: describeStoreBackend()
    }
  };
}

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
  headers = {},
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
        surface: "desktop-local-workbench",
        runtime: "next-route-handler",
        store: describeStoreBackend(),
      },
    };
  }

  // --- setup/onboarding surface ---
  if (method === "GET" && route === "/setup/status") {
    const state = await store.load();
    return { status: 200, body: setupStatus(state) };
  }

  if (method === "POST" && route === "/setup/bootstrap") {
    const seeded = seedDemoState();
    const state = await store.save(seeded);
    return { status: 200, body: setupStatus(state) };
  }

  // --- auth/session surface ---
  if (method === "POST" && route === "/auth/login") {
    const state = await store.load();
    const email = String(body.email ?? body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const ownerEmail = String(process.env.BINDERY_OWNER_EMAIL ?? "owner@bindery.local").trim().toLowerCase();
    const ownerPassword = String(process.env.BINDERY_OWNER_PASSWORD ?? "bindery-local-admin");
    if (email !== ownerEmail || password !== ownerPassword) {
      return { status: 401, body: { ok: false, error: "invalid_credentials" } };
    }
    const user = (state.humanUsers ?? []).find((u) => u.role === "owner") ?? (state.humanUsers ?? [])[0];
    const token = randomUUID();
    const session = { id: `session_${token}`, token, userId: user.id, workspaceId: user.workspaceId, role: user.role, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
    state.sessions = state.sessions ?? [];
    state.sessions.unshift(session);
    await store.save(state);
    return {
      status: 200,
      headers: { "set-cookie": `bindery_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax` },
      body: { ok: true, session: { id: session.id, workspaceId: session.workspaceId, role: session.role }, user: publicUser(user) },
    };
  }

  if (method === "POST" && route === "/auth/logout") {
    const token = sessionTokenFromHeaders(headers) || String(body.token ?? "");
    const state = await store.load();
    state.sessions = (state.sessions ?? []).filter((s) => s.token !== token);
    await store.save(state);
    return { status: 200, headers: { "set-cookie": "bindery_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" }, body: { ok: true } };
  }

  if (method === "GET" && route === "/auth/me") {
    const token = sessionTokenFromHeaders(headers);
    const state = await store.load();
    const session = (state.sessions ?? []).find((s) => s.token === token);
    if (!session) return { status: 401, body: { ok: false, error: "not_authenticated" } };
    session.lastSeenAt = new Date().toISOString();
    await store.save(state);
    const user = (state.humanUsers ?? []).find((u) => u.id === session.userId);
    return { status: 200, body: { ok: true, session: { id: session.id, workspaceId: session.workspaceId, role: session.role }, user: publicUser(user) } };
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
  const wsDiagnosticsMatch = route.match(/^\/workspaces\/([^/]+)\/diagnostics$/);
  if (method === "GET" && wsDiagnosticsMatch) {
    return { status: 200, body: projectDiagnostics(await store.load(), wsDiagnosticsMatch[1]) };
  }
  const wsAccessMatch = route.match(/^\/workspaces\/([^/]+)\/access-topology$/);
  if (method === "GET" && wsAccessMatch) {
    return { status: 200, body: projectAccessTopology(await store.load(), wsAccessMatch[1]) };
  }
  if (method === "GET" && route === "/hardware/routes") {
    const state = await store.load();
    return { status: 200, body: { routes: state.accessRoutes ?? [], hardwareNodes: state.hardwareNodes ?? [] } };
  }

  // --- desktop-first local device plane ---
  const localDeviceMatch = route.match(/^\/workspaces\/([^/]+)\/local-device$/);
  if (method === "GET" && localDeviceMatch) {
    const state = await store.load();
    const workspaceId = localDeviceMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : localDeviceMatch[1];
    const scopes = projectWorkspaceScopes(state);
    return {
      status: 200,
      body: {
        manifest: buildLocalDeviceManifest({ workspaceId }),
        policy: buildDeviceAccessPolicy({ workspaceId, scopes }),
        scopes
      }
    };
  }

  const localScopeMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/scopes$/);
  if (method === "POST" && localScopeMatch) {
    const state = await store.load();
    try {
      const workspaceId = localScopeMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : localScopeMatch[1];
      const scope = createWorkspaceScope({ path: body.path, label: body.label, mode: body.mode });
      state.localDevice = state.localDevice ?? { mode: "desktop-local-device", workspaceScopes: [] };
      state.localDevice.workspaceScopes = state.localDevice.workspaceScopes ?? [];
      state.localDevice.workspaceScopes.unshift({ ...scope, workspaceId });
      state.auditEvents = state.auditEvents ?? [];
      state.auditEvents.unshift({
        id: `audit_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        ts: new Date().toISOString(),
        actorType: "human",
        actor: body.requestedBy ?? "operator",
        action: "local_device.scope.granted",
        target: scope.id,
        message: `로컬 워크스페이스 폴더 권한 등록: ${scope.pathLabel}`
      });
      await store.save(state);
      return { status: 200, body: { ok: true, scope: { id: scope.id, label: scope.label, mode: scope.mode, pathLabel: scope.pathLabel, status: scope.status } } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "local_scope_grant_failed" } };
    }
  }

  const localFilesMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/files$/);
  if (method === "GET" && localFilesMatch) {
    const state = await store.load();
    try {
      const files = await listWorkspaceFiles(state, {
        scopeId: searchParams.get("scopeId") ?? undefined,
        relativePath: searchParams.get("path") ?? ""
      });
      return { status: 200, body: { ok: true, ...files } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "local_file_list_failed" } };
    }
  }

  const localPreviewMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/preview$/);
  if (method === "GET" && localPreviewMatch) {
    const state = await store.load();
    try {
      const preview = await previewWorkspaceFile(state, {
        scopeId: searchParams.get("scopeId") ?? undefined,
        relativePath: searchParams.get("path") ?? ""
      });
      return { status: 200, body: { ok: true, ...preview } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "local_file_preview_failed" } };
    }
  }

  const localWriteMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/files\/write$/);
  if (method === "POST" && localWriteMatch) {
    const state = await store.load();
    try {
      const approval = buildFileWriteApproval(state, {
        scopeId: body.scopeId,
        relativePath: body.path ?? body.relativePath,
        content: body.content,
        requestedBy: body.requestedBy ?? "desktop-operator"
      });
      state.approvals = state.approvals ?? [];
      state.approvals.unshift(approval);
      state.auditEvents = state.auditEvents ?? [];
      state.auditEvents.unshift({
        id: `audit_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        ts: new Date().toISOString(),
        actorType: "human",
        actor: body.requestedBy ?? "desktop-operator",
        action: "local_device.file_write.requested",
        target: approval.id,
        message: approval.summary
      });
      await store.save(state);
      return { status: 200, body: { ok: true, approval: { ...approval, localDeviceAction: { ...approval.localDeviceAction, content: undefined } } } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "local_file_write_request_failed" } };
    }
  }

  const terminalRunMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/terminal\/run$/);
  if (method === "POST" && terminalRunMatch) {
    const state = await store.load();
    try {
      const approval = buildTerminalRunApproval(state, { scopeId: body.scopeId, command: body.command, requestedBy: body.requestedBy ?? "desktop-operator" });
      state.approvals = state.approvals ?? [];
      state.approvals.unshift(approval);
      state.auditEvents = state.auditEvents ?? [];
      state.auditEvents.unshift({ id: `audit_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), ts: new Date().toISOString(), actorType: "human", actor: body.requestedBy ?? "desktop-operator", action: "local_device.terminal_run.requested", target: approval.id, message: approval.summary });
      await store.save(state);
      return { status: 200, body: { ok: true, approval } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "terminal_run_request_failed" } };
    }
  }

  const browserOpenMatch = route.match(/^\/workspaces\/([^/]+)\/local-device\/browser\/open$/);
  if (method === "POST" && browserOpenMatch) {
    const state = await store.load();
    try {
      const approval = buildBrowserOpenApproval(state, { url: body.url, requestedBy: body.requestedBy ?? "desktop-operator" });
      state.approvals = state.approvals ?? [];
      state.approvals.unshift(approval);
      state.auditEvents = state.auditEvents ?? [];
      state.auditEvents.unshift({ id: `audit_${Date.now().toString(36)}`, createdAt: new Date().toISOString(), ts: new Date().toISOString(), actorType: "human", actor: body.requestedBy ?? "desktop-operator", action: "local_device.browser_open.requested", target: approval.id, message: approval.summary });
      await store.save(state);
      return { status: 200, body: { ok: true, approval } };
    } catch (error) {
      return { status: 400, body: { ok: false, error: error instanceof Error ? error.message : "browser_open_request_failed" } };
    }
  }

  const artifactPreviewMatch = route.match(/^\/workspaces\/([^/]+)\/artifacts\/([^/]+)\/preview$/);
  if (method === "GET" && artifactPreviewMatch) {
    const state = await store.load();
    const wsId = artifactPreviewMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : artifactPreviewMatch[1];
    const artifact = (state.artifacts ?? []).find((item) => item.id === artifactPreviewMatch[2] && (!item.workspaceId || item.workspaceId === wsId));
    if (!artifact) return { status: 404, body: { ok: false, error: "artifact_not_found" } };
    return {
      status: 200,
      body: {
        ok: true,
        artifact,
        preview: {
          title: artifact.title,
          kind: artifact.type,
          summary: artifact.summary ?? artifact.title,
          contentRef: artifact.contentRef,
          sourceRunId: artifact.sourceRunId ?? null,
          visibleInOffice: Boolean(artifact.visibleInOffice)
        }
      }
    };
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

  // --- role template catalog (office hiring presets) ---
  if (method === "GET" && route === "/role-templates") {
    return { status: 200, body: { templates: listRoleTemplates() } };
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


  // --- real-world work intake / orchestration boundary ---
  const officeIngestMessageMatch = route.match(/^\/office\/messages\/ingest$/);
  if (method === "POST" && officeIngestMessageMatch) {
    const workspaceId = body.workspaceId ?? body.workspaceRef ?? "default";
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.userMessageIngest,
        workspaceId,
        provider: body.provider ?? "mattermost",
        channelRef: body.channelRef ?? "#tasks",
        threadRef: body.threadRef,
        senderRef: body.senderRef ?? body.requestedBy ?? "operator",
        text: body.text ?? body.message ?? "",
        providerEventId: body.providerEventId ?? `mock-${Date.now()}`,
        lane: body.lane,
      },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const ingestMessageMatch = route.match(/^\/workspaces\/([^/]+)\/messages\/ingest$/);
  if (method === "POST" && ingestMessageMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.userMessageIngest,
        workspaceId: ingestMessageMatch[1],
        provider: body.provider ?? "mattermost",
        channelRef: body.channelRef ?? "#operations",
        threadRef: body.threadRef,
        senderRef: body.senderRef ?? body.requestedBy ?? "operator",
        text: body.text ?? body.message ?? "",
        providerEventId: body.providerEventId ?? `mock-${Date.now()}`,
        lane: body.lane,
      },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }


  const threadReplyMatch = route.match(/^\/workspaces\/([^/]+)\/threads\/([^/]+)\/reply$/);
  if (method === "POST" && threadReplyMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.officeMessagePost,
        workspaceId: threadReplyMatch[1],
        threadId: threadReplyMatch[2],
        channelRef: body.channelRef ?? "#tasks",
        text: body.text ?? "",
        correlationId: body.correlationId ?? threadReplyMatch[2],
        actor: body.actor ?? "bindery-bot",
        provider: body.provider ?? "mattermost-mock",
      },
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const boundaryRunMatch = route.match(/^\/workspaces\/([^/]+)\/orchestration-boundary\/runs$/);
  if (method === "POST" && boundaryRunMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.agentRunEnqueue,
        workspaceId: boundaryRunMatch[1],
        taskId: body.taskId,
        agentId: body.agentId,
        requestedBy: body.requestedBy ?? "operator",
        goal: body.goal ?? body.taskTitle ?? body.taskId,
        externalRef: body.externalRef,
      },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const artifactsMatch = route.match(/^\/workspaces\/([^/]+)\/artifacts$/);
  if (method === "GET" && artifactsMatch) {
    const state = await store.load();
    const wsId = artifactsMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : artifactsMatch[1];
    return { status: 200, body: { artifacts: (state.artifacts ?? []).filter((a) => !a.workspaceId || a.workspaceId === wsId) } };
  }

  const threadsMatch = route.match(/^\/workspaces\/([^/]+)\/(?:office\/)?threads$/);
  if (method === "GET" && threadsMatch) {
    const state = await store.load();
    const wsId = threadsMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : threadsMatch[1];
    return { status: 200, body: { threads: (state.threads ?? []).filter((t) => !t.workspaceId || t.workspaceId === wsId) } };
  }

  const runtimeRunsMatch = route.match(/^\/workspaces\/([^/]+)\/runtime\/runs$/);
  if (method === "GET" && runtimeRunsMatch) {
    const state = await store.load();
    const wsId = runtimeRunsMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : runtimeRunsMatch[1];
    return {
      status: 200,
      body: {
        workspaceId: wsId,
        health: { status: "mock-healthy", adapter: "paperclip-boundary", streaming: "event-log" },
        runs: (state.orchestratorRuns ?? []).filter((run) => !run.workspaceId || run.workspaceId === wsId),
      },
    };
  }

  const runtimeCancelMatch = route.match(/^\/runtime\/runs\/([^/]+)\/cancel$/);
  if (method === "POST" && runtimeCancelMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.agentRunCancel,
        runId: runtimeCancelMatch[1],
        requestedBy: body.requestedBy ?? "operator",
        reason: body.reason ?? "operator_cancelled",
      },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const orchestrationMatch = route.match(/^\/workspaces\/([^/]+)\/orchestration-boundary$/);
  if (method === "GET" && orchestrationMatch) {
    const state = await store.load();
    const wsId = orchestrationMatch[1] === "default" ? (state.workspace?.id ?? "ws_default") : orchestrationMatch[1];
    return {
      status: 200,
      body: {
        workspaceId: wsId,
        adapters: [
          { id: "paperclip", status: "mock-boundary", purpose: "tickets, delegation, budget/governance", credentialState: "not_required_for_mock" },
          { id: "github", status: "mock-boundary", purpose: "issues, PRs, code review targets", credentialState: "redacted" },
          { id: "mattermost", status: "mock-boundary", purpose: "human office threads and approvals", credentialState: "redacted" },
        ],
        runs: (state.orchestratorRuns ?? []).filter((run) => !run.workspaceId || run.workspaceId === wsId),
      },
    };
  }

  // --- platform command endpoints ---
  const runMatch = route.match(/^\/tasks\/([^/]+)\/run$/);
  if (method === "POST" && runMatch) {
    try {
      const outcome = await executeCommand({
        store,
        command: { type: CommandType.taskRun, taskId: runMatch[1], requestedBy: body.requestedBy ?? "operator" },
        office: office(),
      });
      return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
    } catch (error) {
      return { status: 404, body: { ok: false, error: error instanceof Error ? error.message : "task_run_failed" } };
    }
  }

  const planPreviewMatch = route.match(/^\/workspaces\/([^/]+)\/plan-preview$/);
  if (method === "POST" && planPreviewMatch) {
    const state = await store.load();
    const preview = buildPlanPreview(state, {
      workspaceId: planPreviewMatch[1],
      title: body.title ?? "새 업무 목표",
      lane: body.lane ?? "control",
      requestedBy: body.requestedBy ?? "operator"
    });
    return { status: 200, body: { ok: true, preview } };
  }

  const taskCreateMatch = route.match(/^\/workspaces\/([^/]+)\/tasks$/);
  if (method === "POST" && taskCreateMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.taskCreate,
        workspaceId: taskCreateMatch[1],
        title: body.title ?? "새 업무 요청",
        lane: body.lane ?? "control",
        priority: body.priority ?? "normal",
        requiresApproval: body.requiresApproval ?? false,
        expectedOutput: body.expectedOutput,
        requiredCapabilities: body.requiredCapabilities,
        enqueue: body.enqueue ?? true,
        execute: body.execute ?? false,
        requestedBy: body.requestedBy ?? "operator",
      },
      office: office(),
    });
    return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: outcome.result, state: outcome.state } };
  }

  const agentMoveMatch = route.match(/^\/agents\/([^/]+)\/move$/);
  if (method === "POST" && agentMoveMatch) {
    const outcome = await executeCommand({
      store,
      command: {
        type: CommandType.agentMoveRequest,
        workspaceId: body.workspaceId ?? "default",
        agentId: agentMoveMatch[1],
        x: body.x,
        z: body.z,
        source: body.source ?? "floor",
        requestedBy: body.requestedBy ?? "operator",
      },
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
        templateId: body.templateId,
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
    try {
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
      let localDeviceResult = null;
      if ((body.decision ?? "approved") === "approved") {
        const approval = outcome.state.approvals?.find((item) => item.id === decisionMatch[1]);
        localDeviceResult = await applyApprovedFileWrite(outcome.state, approval);
        if (!localDeviceResult) localDeviceResult = applyApprovedTerminalRun(outcome.state, approval);
        if (!localDeviceResult) localDeviceResult = applyApprovedBrowserOpen(approval);
        if (localDeviceResult) {
          outcome.state.auditEvents = outcome.state.auditEvents ?? [];
          outcome.state.auditEvents.unshift({
            id: `audit_${Date.now().toString(36)}`,
            createdAt: new Date().toISOString(),
            ts: new Date().toISOString(),
            actorType: "system",
            actor: "local-device",
            action: `local_device.${localDeviceResult.kind}.applied`,
            target: approval.id,
            message: `${localDeviceResult.kind} 완료 (${localDeviceResult.pathLabel ?? localDeviceResult.host ?? localDeviceResult.cwdLabel ?? "local-device"})`
          });
          await store.save(outcome.state);
        }
      }
      return { status: 200, body: { ok: outcome.ok, decision: outcome.decision, result: { ...outcome.result, localDeviceResult }, state: outcome.state } };
    } catch (error) {
      return { status: 404, body: { ok: false, error: error instanceof Error ? error.message : "approval_decision_failed" } };
    }
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
