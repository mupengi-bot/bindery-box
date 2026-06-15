# BINDERY BOX 3D Office UX Notes

BINDERY BOX uses a **Claw3D-style 3D AI company office** as the primary product surface. The user should feel like they are operating a small AI company: create staff, place them in departments, assign mission cards, watch governed work progress, and inspect details only when needed.

The 3D office is not decorative. It is the frontstage projection of the platform loop:

```txt
Goal / Human message
→ Command
→ Policy + routing
→ Runtime / connector action
→ Event + artifact
→ Persist
→ 3D office + Mattermost + Mission Control projection
```

## Current implementation

The current app uses **Next.js + React Three Fiber + Three.js + Drei**:

- `src/app/page.tsx` boots directly into `OfficeExperience`.
- `OfficeExperience` owns the R3F `Canvas`, RTS-style camera, selected agent state, and move targets.
- `OfficeScene` renders rooms, desks, avatars, zone work-request stations, approval room, and orchestration signals.
- `scene/projection.ts` turns threads/runs/artifacts into renderer-safe desk and zone signals.
- HUD/Sheets keep Mission Control as backstage rather than replacing the 3D office.

The earlier CSS/SVG pseudo-3D prototype has been superseded by the R3F implementation. Future Claw3D upstream imports or desktop/appliance shells must preserve the same projection contracts instead of binding business state directly into renderer internals.

## UX hierarchy

1. **Goal Composer** — “오늘 어떤 일을 맡길까요?” Simple first action. It may preview a plan, recommend staffing, and route work, but advanced admin controls should stay tucked away.
2. **3D Office Stage** — agents, departments, desks, mission state, approval room, artifacts, and live process beacons.
3. **Human Office / Mattermost** — people collaborate in channels/threads; those threads project into the 3D office.
4. **Mission Control Sheets** — governance, approvals, connector health, knowledge graph, raw logs, and deep orchestration traces.

## Operations strategy rules

BINDERY BOX should make operations legible without toy mechanics. Use the office to support autonomy, competence, coordination, meaningful progress, and safe control.

### Do

- Show **meaningful progress**: mission cards completed, approval bottlenecks cleared, artifacts produced, risk reduced.
- Show **agency**: the operator chooses where to place agents, what authority they get, and which workflows stay human-gated.
- Show **competence growth**: configured → validated → governed → production-ready.
- Show **team health**: lane capacity, skill gaps, overloaded agents, approval queues, connector readiness.
- Show **small wins**: “Visible Artifacts”, “Human Gate Governed”, “Mission Card Loop”.
- Make **governance a game mechanic**: permission boundaries, approval packets, audit logs, and rollback readiness are milestones.
- Prefer **recommended placements** over raw “hire more agents” incentives.

### Do not

- Do not reward raw agent count, prompt count, or AI call volume.
- Do not use public individual productivity leaderboards.
- Do not use streak pressure or loss-aversion loops for daily AI use.
- Do not make random rewards or unpredictable agent behavior part of the core work loop.
- Do not turn governance into a hidden settings page; it is part of the operating progression.

## Agent creation and placement loop

The strategic loop should be:

```txt
Detect lane health
→ Recommend role / placement
→ Show first mission
→ Show governance note
→ Create safe agent instance
→ Highlight its desk / lane
→ Offer first mission or permission setup
→ Track operating milestones
```

A recommended hire should include:

- lane / department
- role and suggested name
- reason tied to workload, mission count, or skill gap
- first mission
- governance note
- starter capabilities

This keeps staffing strategic rather than letting users spam agents.

## Reference patterns reviewed

- **ServiceNow / Salesforce control tower patterns** — agent fleet health, observability, escalation, and governance belong in Mission Control.
- **Atlassian Rovo / GitHub coding-agent patterns** — assign work objects to agents; keep plan, run log, artifact, and review packet attached to the work item.
- **Microsoft Copilot Studio / Relay-style approval patterns** — approval requests are first-class cards, not just chat messages.
- **CrewAI-style crew vs flow distinction** — ambiguous goals can use flexible crews; repeated regulated work should become deterministic flows.
- **Clay-style bulk workbench** — high-volume row-based work should expose status, evidence, confidence, cost, and human review needs.

## Implementation boundaries

- 3D status signals must not autonomously move avatars. Movement remains operator-commanded via persisted `agent.move.requested`.
- Lite mode must keep labels and signals cheap.
- Mission Control details may be rich, but the default office should stay focused: Goal Composer, selected agent, critical alerts, and visible work signals.
- All demo strategy data must remain public-safe and must not include secrets, customer data, or real credentials.
