// @bindery-box/golden-image
//
// The "Golden Image" is the canonical, machine-readable declaration of BINDERY
// BOX / MUFI Box's core product identity: the planes that run behind the
// Claw3D-style 3D office, the UX layers, the surfaces, and the invariants that
// every future change must preserve.
//
// This module is the single source of truth. Documentation (docs/golden-image.md)
// and the committed snapshot (docs/golden-image/manifest.json) are projections
// of it, the API serves it, and the 3D office HUD renders from it.
//
// Public-safe by construction: it declares structure and intent only. No
// secrets, no private/internal paths, no vendor or model names ever belong in
// this manifest.

export const GOLDEN_IMAGE_VERSION = "1.0.0";

// --- Invariants -------------------------------------------------------------
// These are the load-bearing product rules. scripts/validate-golden-image.mjs
// enforces that they remain present and that the running app honours them, so a
// future change cannot silently regress the core identity.
export const GOLDEN_IMAGE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "3d-office-frontstage",
    statement: "The Claw3D-style 3D office is the primary surface (frontstage).",
    rationale:
      "Work becomes visible as a spatial office; the app must boot directly into the 3D office, not a console.",
  }),
  Object.freeze({
    id: "messenger-human-office",
    statement: "Humans collaborate through a familiar messenger 'human office', not a bespoke operator console.",
    rationale:
      "People should not have to learn the platform first; the messenger is where conversation and collaboration live.",
  }),
  Object.freeze({
    id: "runtime-command-event-lifecycle",
    statement:
      "All business state changes flow through Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection.",
    rationale:
      "No surface (3D scene, messenger adapter, runtime worker) may mutate business state directly or bypass policy.",
  }),
  Object.freeze({
    id: "mission-control-backstage",
    statement: "Mission Control is backstage governance, reached by progressive disclosure — never the landing surface.",
    rationale:
      "Operators govern from slide-over sheets layered on top of the office; governance is available, not in the way.",
  }),
  Object.freeze({
    id: "no-2d-dashboard-first",
    statement: "No 2D-dashboard-first regression: the app must never boot into a 2D dashboard as its main surface.",
    rationale:
      "The golden image is an office-first product. A dashboard-first landing page would erase its core identity.",
  }),
]);

// The canonical runtime invariant string, kept byte-identical to the
// architecture docs so the two cannot drift.
export const RUNTIME_LIFECYCLE =
  "Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection";

// --- Core planes ------------------------------------------------------------
// The six core-identity planes that run behind the office. `maturity` reflects
// how real each plane is today: "live" (running in this build), "mock"
// (simulated boundary, real adapter pending), "planned" (declared, not yet wired).
export const GOLDEN_IMAGE_PLANES = Object.freeze([
  Object.freeze({
    id: "control-plane",
    name: "Control Plane",
    role: "Command lifecycle, policy decisions, and projections.",
    owns: ["commands", "approvals", "visible state", "API surface"],
    mustNotOwn: ["provider-specific runtime internals", "direct UI mutation of business state"],
    surface: "src/server/controlPlane.mjs",
    maturity: "live",
  }),
  Object.freeze({
    id: "agent-runtime",
    name: "Agent Runtime",
    role: "Agent job queue, run lifecycle, tool calls, and streaming output.",
    owns: ["agent job queue", "run lifecycle", "tool calls", "retries"],
    mustNotOwn: ["UI layout", "messenger formatting"],
    surface: "packages/runtime",
    maturity: "mock",
  }),
  Object.freeze({
    id: "human-office",
    name: "Human Office / Messenger",
    role: "Messenger channels, threads, and visible human collaboration.",
    owns: ["human conversation", "channel routing", "approval threads"],
    mustNotOwn: ["runtime secrets", "direct tool execution"],
    surface: "packages/office-mattermost",
    maturity: "mock",
  }),
  Object.freeze({
    id: "connector-hub",
    name: "Connector Hub",
    role: "Connector manifests and scoped capability grants to customer systems.",
    owns: ["connector manifests", "capability map", "scoped grants"],
    mustNotOwn: ["tenant credentials", "direct UI decisions"],
    surface: "packages/connectors",
    maturity: "live",
  }),
  Object.freeze({
    id: "data-policy",
    name: "Data & Policy",
    role: "Append-only events, projections, audit, knowledge graph, and governance gates.",
    owns: ["events", "projections", "audit log", "knowledge graph", "approval rules", "human gates"],
    mustNotOwn: ["raw private credentials", "transport-specific formatting"],
    surface: "packages/data-store, packages/policy, packages/knowledge",
    maturity: "live",
  }),
  Object.freeze({
    id: "desktop-launcher",
    name: "Desktop Launcher",
    role: "Install, start/stop, updates, local permissions, and appliance lifecycle.",
    owns: ["install", "start/stop", "updates", "local permission grants"],
    mustNotOwn: ["cloud tenant state", "shared business projections"],
    surface: "appliance (declared)",
    maturity: "planned",
  }),
]);

// --- UX layers (progressive disclosure) -------------------------------------
// Three tiers, from always-visible to on-demand. This ordering is itself an
// invariant: frontstage is the office, messenger is collaboration, backstage is
// governance reached by disclosure.
export const GOLDEN_IMAGE_UX_LAYERS = Object.freeze([
  Object.freeze({
    id: "frontstage",
    name: "3D Office (Claw3D)",
    tier: "primary",
    disclosure: "always-visible",
    description: "The spatial office where agents work as visible staff. The app boots here.",
    invariantRefs: ["3d-office-frontstage", "no-2d-dashboard-first"],
  }),
  Object.freeze({
    id: "messenger",
    name: "Human Office",
    tier: "collaboration",
    disclosure: "channel/thread",
    description: "Familiar messenger rooms where humans talk to each other and to agents.",
    invariantRefs: ["messenger-human-office"],
  }),
  Object.freeze({
    id: "backstage",
    name: "Mission Control",
    tier: "governance",
    disclosure: "progressive (slide-over sheets)",
    description: "Operator governance — missions, approvals, connectors, knowledge — layered on demand.",
    invariantRefs: ["mission-control-backstage"],
  }),
]);

// --- Surfaces ---------------------------------------------------------------
// Concrete entry points that render or expose the golden image today.
export const GOLDEN_IMAGE_SURFACES = Object.freeze([
  Object.freeze({ id: "office-3d", name: "3D Office Experience", kind: "ui", path: "src/features/office", uxLayer: "frontstage" }),
  Object.freeze({ id: "hud-sheets", name: "HUD Sheets", kind: "ui", path: "src/features/office/hud", uxLayer: "backstage" }),
  Object.freeze({ id: "control-api", name: "Control Plane API", kind: "api", path: "src/app/api/[...path]/route.ts", uxLayer: "backstage" }),
  Object.freeze({ id: "golden-image-api", name: "Golden Image API", kind: "api", path: "/api/golden-image", uxLayer: "backstage" }),
]);

// The full, frozen manifest. This is what the API serves and the UI renders.
export const GOLDEN_IMAGE = Object.freeze({
  schema: "bindery-box/golden-image@1",
  version: GOLDEN_IMAGE_VERSION,
  product: "BINDERY BOX / MUFI Box",
  codename: "golden-image",
  identity: Object.freeze({
    tagline: "An AI Company-in-a-Box, rendered as a living 3D office.",
    northStar:
      "Humans talk in familiar messenger rooms, agents work as visible staff in the Claw3D office, and Mission Control stays the operator governance layer.",
    surface: "claw3d-3d-office",
  }),
  lifecycle: RUNTIME_LIFECYCLE,
  invariants: GOLDEN_IMAGE_INVARIANTS,
  planes: GOLDEN_IMAGE_PLANES,
  uxLayers: GOLDEN_IMAGE_UX_LAYERS,
  surfaces: GOLDEN_IMAGE_SURFACES,
});

/** Return the canonical, static golden-image manifest. */
export function getGoldenImage() {
  return GOLDEN_IMAGE;
}

// --- Live projection --------------------------------------------------------
// Overlay lightweight, public-safe runtime signals onto each plane so the HUD
// can show what is actually moving behind the office right now. Derived purely
// from already-public projections (counts), never from secrets.
function planeRuntime(planeId, metrics, signals) {
  switch (planeId) {
    case "control-plane":
      return { state: "running", signals: { commandsRouted: "ready" } };
    case "agent-runtime": {
      const state = metrics.runningTasks > 0 ? "running" : metrics.queuedTasks > 0 ? "queued" : "ready";
      return { state, signals: { running: metrics.runningTasks, queued: metrics.queuedTasks, waitingApproval: metrics.waitingApproval } };
    }
    case "human-office": {
      const officeEvents = metrics.officeEvents ?? 0;
      return { state: officeEvents > 0 ? "running" : "ready", signals: { officeEvents } };
    }
    case "connector-hub":
      return { state: "ready", signals: { connectors: signals.connectors ?? 0 } };
    case "data-policy":
      return {
        state: "running",
        signals: { store: signals.store ?? "in-memory", pendingApprovals: metrics.pendingApprovals, completedTasks: metrics.completedTasks },
      };
    case "desktop-launcher":
      return { state: "planned", signals: {} };
    default:
      return { state: "ready", signals: {} };
  }
}

/**
 * Project the golden image with live runtime status overlaid per plane.
 * @param {object} params
 * @param {object} params.metrics  output of runtime deriveMetrics(state)
 * @param {object} [params.signals]  extra public counts ({ connectors, store })
 * @param {string} [params.workspaceId]
 */
export function projectGoldenImage({ metrics = {}, signals = {}, workspaceId = "default", generatedAt = null } = {}) {
  const planes = GOLDEN_IMAGE_PLANES.map((p) => ({ ...p, runtime: planeRuntime(p.id, metrics, signals) }));
  const liveCount = planes.filter((p) => p.runtime.state === "running").length;
  return {
    ...GOLDEN_IMAGE,
    workspaceId,
    generatedAt,
    planes,
    status: {
      planesTotal: planes.length,
      planesLive: liveCount,
      invariants: GOLDEN_IMAGE_INVARIANTS.length,
      surface: GOLDEN_IMAGE.identity.surface,
    },
  };
}

/**
 * Self-validate the manifest's internal integrity (shape, invariant refs,
 * required planes). Returns { ok, errors } so guardrail scripts can assert.
 */
export function validateGoldenImageManifest(manifest = GOLDEN_IMAGE) {
  const errors = [];
  const requiredPlaneIds = ["control-plane", "agent-runtime", "human-office", "connector-hub", "data-policy", "desktop-launcher"];
  const requiredInvariantIds = [
    "3d-office-frontstage",
    "messenger-human-office",
    "runtime-command-event-lifecycle",
    "mission-control-backstage",
    "no-2d-dashboard-first",
  ];

  const planeIds = new Set((manifest.planes ?? []).map((p) => p.id));
  for (const id of requiredPlaneIds) if (!planeIds.has(id)) errors.push(`missing plane: ${id}`);

  const invariantIds = new Set((manifest.invariants ?? []).map((i) => i.id));
  for (const id of requiredInvariantIds) if (!invariantIds.has(id)) errors.push(`missing invariant: ${id}`);

  if (manifest.lifecycle !== RUNTIME_LIFECYCLE) errors.push("lifecycle string drifted from canonical RUNTIME_LIFECYCLE");
  if (manifest.identity?.surface !== "claw3d-3d-office") errors.push("surface is not claw3d-3d-office");

  // Every UX-layer invariantRef must resolve to a real invariant.
  for (const layer of manifest.uxLayers ?? []) {
    for (const ref of layer.invariantRefs ?? []) {
      if (!invariantIds.has(ref)) errors.push(`uxLayer ${layer.id} references unknown invariant: ${ref}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
