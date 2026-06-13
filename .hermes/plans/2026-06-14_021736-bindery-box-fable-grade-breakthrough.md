# BINDERY BOX Fable-Grade Breakthrough Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. If subagent/CLI delegation is unavailable, implement one phase at a time with the same verification gates. Do not regress the Golden Image: the 3D Office remains the frontstage, and dashboards remain progressive-disclosure backstage surfaces.

**Goal:** Turn the current Claw3D-style BINDERY BOX prototype into a credible agentic operations product by closing UX, runtime, persistence, messenger, artifact, observability, and deployment gaps end-to-end.

**Architecture:** Preserve the five-plane product architecture: 3D Office Frontstage, Control Plane, Agent Runtime Plane, Human Office/Messenger Plane, and Data/Audit/Knowledge Plane. The UX must implement the full agentic work loop: `Goal -> Plan Preview -> Run Status -> Human Gate/Interrupt -> Artifact -> Metrics -> Messenger Sync`.

**Tech Stack:** Next.js 16 App Router, React 19, React Three Fiber/Drei/Three.js, Vercel serverless API, packages/runtime/domain/contracts/data-store/policy/connectors/knowledge/office-mattermost, Supabase/Postgres target, Mattermost target, local/worker runtime target.

---

## 0. Current Reality Snapshot

### Current strengths
- Strong product identity: Claw3D-style 3D AI company office.
- Existing Golden Image checks prevent regression to dashboard-first UX.
- Goal Composer, 3D movement, right-click movement, scroll zoom, no autonomous walking, work request stations, employee creation, HUD sheets, and performance board exist.
- Command/event architecture is already present in contracts/runtime.

### Current hard limits
- `/api/health` reports `backend=memory`, `persistent=false`, `mode=stateless-demo`.
- Agent Runtime is still `mock` in Golden Image.
- Human Office / Mattermost is still `mock`.
- Desktop Launcher is `planned`.
- 3D currently acts more like a metaphor/background than a true operational twin.
- Goal Composer creates tasks but does not yet show a plan preview with data, tools, permissions, expected artifact, confidence, and approval points.
- Human Gate exists but lacks proposed action preview, confidence, evidence, risk explanation, edit-and-approve, and rejection feedback loop.
- Active run status surface is weak: no elapsed time, step list, ETA, pause/cancel/redirect, persistent status across sessions.
- Artifact/result UX is missing: no durable report/email/checklist output center.
- Role-based and mobile/2D-safe UX are weak.
- Browser audit saw an intermittent blank render state; must add boot diagnostics and fallback.

---

## 1. Product North Star

BINDERY BOX must feel like:

```txt
A small AI operations team installed inside a company.
Humans delegate goals from a simple composer or messenger.
AI staff plan, execute, pause for approvals, produce artifacts,
and report progress through a living 3D office plus inspectable backstage.
```

The core demo loop that must work end-to-end:

```txt
User goal
  -> plan preview
  -> approve execution
  -> runtime run starts
  -> 3D office shows active work at the relevant zone/desk
  -> active run surface shows step/time/progress/cancel/redirect
  -> human gate appears if risky action is reached
  -> artifact is produced
  -> Mattermost thread receives summary
  -> metrics update from real events
  -> audit trail and trace remain inspectable
```

---

## 2. UX Principles

1. **3D office is the frontstage, not decorative background.** Work state must appear inside the spatial office.
2. **Simple frontstage, observable backstage.** The primary screen should show next action and active work; raw logs and traces should be secondary.
3. **No agentwashing.** A task-specific agent must perform a repeatable end-to-end workflow or be labelled demo/mock.
4. **User sees the plan before the agent runs.** High-value UX starts at Plan Preview.
5. **Long-running work needs a persistent status surface.** Every run has steps, elapsed time, ETA, interrupt, redirect, and post-run summary.
6. **Human Gate must earn trust.** Show proposed action, risk, confidence, evidence, preview/diff, and alternatives.
7. **Artifacts are the product output.** Reports, emails, checklists, and risk memos must be first-class objects.
8. **Metrics must be event-derived.** No unexplained scores.
9. **3D failure must not kill the product.** Always have boot diagnostics, WebGL health, and 2D Safe Cockpit.
10. **Role-based views.** CEO/Operator/Admin/Field users should see different default layers.

---

## 3. Phase Roadmap

### Phase 1 — UX Work Loop Foundation

**Objective:** Make the cockpit explain what agents will do, what they are doing, and what they produced.

**Acceptance criteria:**
- Goal Composer has Plan Preview before task creation/execution.
- Active Runs panel replaces log-first UX as the main status surface.
- Human Gate card shows risk, confidence, evidence, and action preview.
- Artifact Center exists with mock/deterministic artifacts generated from task runs.
- 3D office displays work cards/beacons/artifact markers projected from state.
- Validation gates cover these UX invariants.

### Phase 2 — Persistence + Boot Reliability

**Objective:** Make the demo stable and durable.

**Acceptance criteria:**
- `/api/health` can report persistent store when env is configured.
- Supabase/Postgres schema migration exists.
- State survives refresh/cold start in hosted mode.
- WebGL/Canvas error boundary exists.
- 2D Safe Cockpit fallback exists.
- Boot diagnostics panel exists.

### Phase 3 — Real Runtime Worker MVP

**Objective:** Make one agent actually perform one repeatable workflow.

**Acceptance criteria:**
- Runtime run lifecycle includes queued/started/step/progress/artifact/completed/failed/cancelled.
- Production risk workflow reads deterministic demo data and creates a real artifact.
- Agent run streams condensed progress events.
- Cancel and redirect command endpoints exist.
- Metrics derive from runtime events.

### Phase 4 — Human Office / Mattermost MVP

**Objective:** Connect human collaboration to the 3D office.

**Acceptance criteria:**
- Mattermost adapter can post to mapped channels.
- Message ingest endpoint creates task commands.
- Approval link/button flow updates Human Gate.
- Artifact summary posts back to thread.
- 3D office and messenger thread share run/task IDs.

### Phase 5 — Role-Based Productization

**Objective:** Make the product usable by different enterprise roles and devices.

**Acceptance criteria:**
- Operator/Manager/Admin role switch exists.
- Mobile/tablet layout uses card-first 2D safe surfaces.
- Cost/time/ROI visibility exists.
- Design tokens/components replace scattered inline styles over time.
- Demo script supports a 5-minute customer pitch.

---

## 4. Detailed Implementation Tasks

## Phase 1: UX Work Loop Foundation

### Task 1.1: Add formal UX state model for run planning

**Objective:** Represent Plan Preview as a typed projection before creating/running work.

**Files:**
- Modify: `src/features/office/types.ts`
- Modify: `packages/contracts/src/index.mjs`
- Modify: `packages/domain/src/index.mjs`
- Modify: `packages/runtime/src/index.mjs`
- Modify: `scripts/validate-rts-office.mjs`

**Implementation notes:**
Add types/entities:

```ts
export interface PlanPreview {
  id: string;
  title: string;
  lane: LaneId;
  assignedAgentId: string | null;
  assignedAgentName: string;
  steps: { id: string; label: string; risk: "low" | "medium" | "high" }[];
  requiredData: string[];
  requiredCapabilities: string[];
  expectedArtifacts: string[];
  approvals: { required: boolean; reason: string; boundary: string }[];
  estimatedMinutes: number;
  confidence: number;
}
```

Contract target:

```txt
command: task.plan.preview
event: task.plan.previewed
```

**Verification:**
- `npm run check:rts` checks `PlanPreview`, `task.plan.preview`, and `task.plan.previewed` exist.
- `npm run build` passes.

---

### Task 1.2: Implement Plan Preview API endpoint

**Objective:** Convert a raw goal into deterministic plan preview data without creating a task yet.

**Files:**
- Modify: `src/server/controlPlane.mjs`
- Modify: `packages/runtime/src/index.mjs`
- Test/validate: `scripts/validate-core.mjs`

**Endpoint:**

```txt
POST /api/workspaces/:id/plan-preview
body: { title, lane, requestedBy }
```

**Behavior:**
- Choose agent by lane.
- Infer required data by lane:
  - production: production logs, order backlog, supplier status
  - sales: quotes, CRM last contact, customer priority
  - scope3: supplier emission factors, electricity usage, missing data list
  - control: approvals, audit log, policy state
- Return `PlanPreview` with confidence and approvals.
- Do not mutate task state.

**Verification:**
- `npm run check` verifies endpoint returns preview and does not increase task count.

---

### Task 1.3: Upgrade GoalComposer to two-step plan flow

**Objective:** Replace immediate task creation with goal input -> plan preview -> execute/modify/schedule.

**Files:**
- Modify: `src/features/office/useOfficeData.ts`
- Modify: `src/features/office/hud/GoalComposer.tsx`
- Create: `src/features/office/hud/PlanPreviewPanel.tsx`
- Modify: `scripts/validate-rts-office.mjs`

**UI:**
- Primary button initially says `계획 보기`.
- After preview, show:
  - assigned agent
  - steps
  - required data
  - required capabilities
  - expected artifacts
  - approval boundaries
  - confidence
  - estimated time
- Buttons: `실행`, `수정`, `예약`.

**Verification:**
- Browser: input goal -> preview appears -> execute creates task.
- `npm run check:rts` checks `PlanPreviewPanel`, `계획 보기`, `expectedArtifacts`.

---

### Task 1.4: Introduce Active Run projection

**Objective:** Show long-running work as first-class run cards instead of only event logs.

**Files:**
- Modify: `packages/runtime/src/index.mjs`
- Modify: `src/features/office/types.ts`
- Create: `src/features/office/hud/ActiveRuns.tsx`
- Modify: `src/features/office/hud/Hud.tsx`
- Modify: `scripts/validate-rts-office.mjs`

**Projection shape:**

```ts
export interface ActiveRun {
  id: string;
  taskId: string;
  title: string;
  agentId: string;
  agentName: string;
  lane: LaneId;
  status: "queued" | "running" | "waiting_approval" | "completed" | "failed" | "cancelled";
  currentStep: string;
  stepIndex: number;
  stepTotal: number;
  progress: number;
  elapsedSeconds: number;
  etaSeconds: number | null;
  interruptible: boolean;
  artifactIds: string[];
}
```

**UI:**
- Right rail prioritizes `Active Runs`.
- Live Log becomes collapsible/debug.
- Each run has `Pause`, `Redirect`, `Cancel`, `Trace` buttons, initially mocked/disabled if endpoints not yet implemented.

**Verification:**
- `npm run check:rts` checks `ActiveRuns`, `elapsedSeconds`, `Cancel`, `Redirect`.

---

### Task 1.5: Upgrade Human Gate approval UX

**Objective:** Turn approvals into trust-building decision cards.

**Files:**
- Modify: `packages/runtime/src/index.mjs`
- Modify: `src/features/office/types.ts`
- Modify: `src/features/office/hud/Sheets.tsx`
- Create: `src/features/office/hud/ApprovalDecisionCard.tsx`
- Modify: `scripts/validate-rts-office.mjs`

**Fields:**

```ts
interface ApprovalDecision {
  id: string;
  title: string;
  proposedAction: string;
  risk: "medium" | "high";
  confidence: number;
  reason: string;
  evidence: { label: string; source: string }[];
  preview: string;
  actions: ["approve", "edit", "reject", "delegate"];
}
```

**Verification:**
- Approval sheet displays proposed action, confidence, evidence, preview.
- Approve/reject still calls existing decision endpoint.

---

### Task 1.6: Add Artifact Center and artifact model

**Objective:** Make produced outputs visible and inspectable.

**Files:**
- Modify: `packages/domain/src/index.mjs`
- Modify: `packages/runtime/src/index.mjs`
- Modify: `src/features/office/types.ts`
- Create: `src/features/office/hud/ArtifactCenter.tsx`
- Modify: `src/features/office/hud/Sheets.tsx`
- Modify: `scripts/validate-rts-office.mjs`

**Artifact types:**

```txt
report
email_draft
checklist
risk_memo
approval_memo
csv_export
```

**Artifact fields:**

```ts
id, taskId, runId, type, title, summary, body, createdAt, sourceRefs, status
```

**Verification:**
- Running seeded task creates deterministic artifact.
- Artifact sheet lists and opens it.

---

### Task 1.7: Project work state into 3D scene

**Objective:** Make 3D office carry operational meaning.

**Files:**
- Modify: `src/features/office/scene/OfficeScene.tsx`
- Create: `src/features/office/scene/WorkCard.tsx`
- Create: `src/features/office/scene/ZoneBeacon.tsx`
- Create: `src/features/office/scene/ArtifactProp.tsx`
- Modify: `src/features/office/routing.ts` only if needed, preserving no autonomous movement.

**3D projections:**
- Zone workload badges.
- Risk pulse on lane rugs.
- Active run card near assigned desk.
- Artifact prop on desk after completion.
- Approval marker in meeting room.

**Verification:**
- Browser screenshot confirms 3D contains work state, not only HUD.
- `npm run check:rts` checks `WorkCard`, `ZoneBeacon`, `ArtifactProp`.

---

### Task 1.8: Add Phase 1 docs and verification gates

**Objective:** Make new UX invariants durable.

**Files:**
- Modify: `docs/architecture/rts-office-interaction.md`
- Create: `docs/architecture/agentic-work-loop.md`
- Modify: `scripts/validate-rts-office.mjs`
- Modify: `scripts/validate-golden-image.mjs` if Golden Image needs new invariant.

**New invariant:**

```txt
Every agentic workflow must expose plan preview, persistent run status, human gate, artifact, and event-derived metrics.
```

**Verification:**
- `npm run check:rts`
- `npm run check:golden`
- `npm run check:arch`
- `npm run check`
- `npm run build`
- `npm audit --omit=dev --audit-level=moderate`

---

## Phase 2: Persistence + Boot Reliability

### Task 2.1: Add Supabase/Postgres migration

**Objective:** Persist state, events, artifacts, and runs.

**Files:**
- Create: `supabase/migrations/0001_bindery_state.sql`
- Modify: `packages/data-store/src/index.mjs`
- Modify: `README.md`

**Tables:**
- `bindery_workspaces`
- `bindery_events`
- `bindery_tasks`
- `bindery_runs`
- `bindery_artifacts`
- `bindery_approvals`
- `bindery_state_snapshots`

**Verification:**
- Local migration applies.
- `/api/health` reports persistent true when env exists.

---

### Task 2.2: Add boot diagnostics and 2D fallback

**Objective:** Prevent blank screen from killing demos.

**Files:**
- Create: `src/features/office/BootDiagnostics.tsx`
- Create: `src/features/office/SafeCockpit.tsx`
- Modify: `src/features/office/OfficeExperience.tsx`
- Modify: `src/app/page.tsx` if dynamic boot fallback needed.

**Checks:**
- WebGL support.
- Canvas context lost event.
- API health.
- Workstream fetch.
- Last boot error in session storage.

**Fallback:**
- 2D cockpit with Goals, Active Runs, Approvals, Artifacts, Logs.

**Verification:**
- Simulate WebGL failure and confirm Safe Cockpit renders.
- Browser console no uncaught JS errors.

---

## Phase 3: Real Runtime Worker MVP

### Task 3.1: Add worker lifecycle contracts

**Objective:** Support real run events.

**Events:**
- `agent.run.started`
- `agent.run.step.started`
- `agent.run.step.completed`
- `agent.run.progressed`
- `artifact.created`
- `agent.run.cancelled`
- `agent.run.redirected`
- `agent.run.failed`

**Files:**
- Modify: `packages/contracts/src/index.mjs`
- Modify: `docs/contracts/agent-messenger-contract.json`

---

### Task 3.2: Implement deterministic Production Risk worker

**Objective:** Build one real workflow that creates a real artifact.

**Files:**
- Create: `packages/runtime/src/workers/productionRiskWorker.mjs`
- Create: `examples/manufacturing-demo/production-risk.json`
- Modify: `packages/runtime/src/index.mjs`

**Output:**
- Risk causes.
- Recommended actions.
- Report artifact.

---

### Task 3.3: Add cancel/redirect endpoints

**Endpoints:**

```txt
POST /api/runs/:id/cancel
POST /api/runs/:id/redirect
```

**Files:**
- Modify: `src/server/controlPlane.mjs`
- Modify: `src/features/office/useOfficeData.ts`
- Modify: `src/features/office/hud/ActiveRuns.tsx`

---

## Phase 4: Mattermost MVP

### Task 4.1: Replace mock office adapter with configurable Mattermost adapter

**Files:**
- Modify: `packages/office-mattermost/src/index.mjs`
- Create: `packages/office-mattermost/src/mattermostAdapter.mjs`
- Modify: `src/server/controlPlane.mjs`

**Env:**
- `MATTERMOST_URL`
- `MATTERMOST_TOKEN`
- `MATTERMOST_TEAM_ID`
- `MATTERMOST_CHANNEL_PRODUCTION`
- `MATTERMOST_CHANNEL_SALES`
- `MATTERMOST_CHANNEL_SCOPE3`
- `MATTERMOST_CHANNEL_APPROVALS`

Never log token values.

---

### Task 4.2: Add message ingest endpoint

**Endpoint:**

```txt
POST /api/office/messages/ingest
```

**Behavior:**
- Map channel -> lane.
- Create plan preview or task.
- Return task/run IDs.

---

### Task 4.3: Post artifacts and approvals to threads

**Behavior:**
- On `approval.requested`, post preview + approval link.
- On `artifact.created`, post summary and link.

---

## Phase 5: Productization

### Task 5.1: Role-based views

**Roles:**
- Operator
- Manager
- Admin
- Field

**Files:**
- Create: `src/features/office/hud/RoleSwitcher.tsx`
- Create: `src/features/office/roleViews.ts`
- Modify: `Hud.tsx`

---

### Task 5.2: Mobile/tablet layout

**Behavior:**
- Desktop: 3D office frontstage.
- Tablet: 3D + card rail.
- Mobile: Safe Cockpit card-first; 3D minimized.

**Files:**
- Modify: `src/app/globals.css`
- Modify HUD layout components.

---

### Task 5.3: Event-derived metrics and ROI

**Metrics:**
- Average task duration.
- Approval wait time.
- Automation rate.
- Human intervention rate.
- Artifact count.
- Estimated time saved.

**Files:**
- Modify: `packages/runtime/src/index.mjs`
- Modify: `src/features/office/hud/PerformanceBoard.tsx`

---

## 5. Verification Strategy

Run after every phase:

```bash
npm run check:rts
npm run check:golden
npm run check:arch
npm run check
npm run build
npm audit --omit=dev --audit-level=moderate
```

Browser verification after deployment:

```txt
1. First-run overlay renders.
2. Skip to cockpit works.
3. Goal -> Plan Preview works.
4. Execute creates Active Run.
5. Active Run progresses and creates Artifact.
6. Approval card shows confidence/evidence/preview.
7. 3D scene shows work state.
8. Safe Cockpit fallback can be triggered.
9. Console has no uncaught JS errors.
10. /api/health reports intended store mode.
```

---

## 6. Commit Strategy

Commit after each task or small group:

```txt
feat: add plan preview contracts
feat: add plan preview endpoint
feat: upgrade goal composer with plan preview
feat: add active run status surface
feat: improve human gate decision cards
feat: add artifact center
feat: project work state into 3d office
fix: add webgl fallback and boot diagnostics
feat: add persistent store migration
feat: add production risk runtime worker
feat: add mattermost office adapter
feat: add role-based office views
```

Do not commit secrets. Do not commit `.env`. Do not log tokens.

---

## 7. Risks and Mitigations

### Risk: 3D becomes cluttered
**Mitigation:** Put only operational signals in 3D; raw detail stays in sheets.

### Risk: Runtime implementation balloons
**Mitigation:** Start with one deterministic Production Risk worker before generalizing.

### Risk: UX becomes dashboard-first again
**Mitigation:** Golden Image gate must assert Canvas/Office remains frontstage and Safe Cockpit is fallback only.

### Risk: Persistence schema overengineering
**Mitigation:** Start with event log + state snapshot + artifacts. Normalize later.

### Risk: Mattermost credentials unavailable
**Mitigation:** Keep mock adapter, add interface tests, enable real adapter only with env.

### Risk: Browser/WebGL failures
**Mitigation:** Safe Cockpit, WebGL diagnostics, context lost recovery.

---

## 8. Definition of Done for “Fable-Grade” MVP

BINDERY BOX reaches the next credible product milestone when this exact demo works:

```txt
1. User opens BINDERY BOX.
2. First-run overlay explains the product and offers production/sales/scope3 objectives.
3. User enters: “생산 2라인 납기 위험 점검해줘.”
4. Plan Preview appears with assigned agent, steps, data, permissions, expected report, risk, confidence, ETA.
5. User runs it.
6. Active Run card shows step progress, elapsed time, cancel/redirect.
7. 3D office shows Production zone active beacon and a work card near Production Leader.
8. Runtime worker reads deterministic demo data and creates a risk report artifact.
9. If approval is needed, Human Gate shows proposed action, confidence, evidence, preview.
10. Artifact appears in Artifact Center and as a desk prop in 3D.
11. Performance metrics update from events.
12. Mattermost receives a thread summary if configured.
13. Refreshing the page preserves state in persistent mode.
14. If WebGL fails, Safe Cockpit still lets the operator manage the run.
```

That is the line between “impressive demo” and “credible agentic operations product.”
