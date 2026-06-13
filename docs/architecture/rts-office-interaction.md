# RTS Office Interaction Model

BINDERY BOX uses the Claw3D office as an RTS-like operating board: the camera is stable, staff are selectable units, floor clicks express persisted movement commands, and department zones are work-request surfaces.

## UX invariants

1. **Fixed camera first** — the default view is an isometric office board. Free orbit is not the primary interaction.
2. **Select unit, then command** — clicking an agent selects that person. Clicking the floor creates `agent.move.requested`, records a target, and projects the avatar there.
3. **No autonomous walking** — runtime status (`running`, `waiting_approval`, `blocked`) may change colors, panels, logs, and desk activity, but it must not move a person. Physical movement only happens from an explicit operator coordinate command.
4. **Zones are actionable** — every department room has a visible `＋ 업무 요청` station. Clicking a station opens the Goal Composer filtered to that lane.
5. **Zone requests create real tasks** — typed zone requests go through `task.create`, produce `task.created`, and surface as runnable missions.
6. **People expose role prompts** — selecting a person opens a card with role, persona, capabilities, KPI, active mission, and public-safe prompt text.
7. **People can be created from templates** — the composer exposes role templates, prompt previews, and safe default permissions.
8. **Commands remain projections** — movement, work requests, and hires go through `Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection`.
9. **First win before cockpit complexity** — first-time users see an objective overlay with production/sales/Scope 3 cards before they have to understand logs, connectors, or policies.
10. **Observable but not noisy** — the default HUD shows next best action and performance board; raw event detail stays in Live Process and sheets.

## Interaction flow

### Move an agent

```txt
click agent
  -> selectedAgentId
click floor/zone coordinate with left click or right click
  -> optimistic local marker
  -> POST /api/agents/:id/move
  -> command: agent.move.requested
  -> policy check
  -> event: agent.move.accepted
  -> event: agent.move.projected
  -> workstream agent.moveTarget
  -> avatar route override after refresh
```

The UI remains immediate, but the canonical state is persisted on the agent projection.

### Request work from a zone

```txt
click department work station
  -> Goal Composer opens
  -> lane filter is set
  -> request text is prefilled
operator submits request
  -> POST /api/workspaces/:id/tasks
  -> command: task.create
  -> event: task.created
  -> optional event: agent.run.queued
  -> workstream mission appears as runnable
```

Zone work is no longer only a UI prefill; it becomes a real task in the platform lifecycle.

### Inspect a person

```txt
click agent/person
  -> AgentPanel
  -> status + performance
  -> persona + role prompt
  -> capabilities + runnable owned mission
```

### Create a person

```txt
Goal Composer > 직원 생성
  -> choose role template or custom
  -> preview public-safe prompt
  -> POST /api/workspaces/:id/agents
  -> command: agent.create
  -> event: agent.created
  -> workstream projection shows new staff member
```

Templates are exposed by:

```txt
GET /api/role-templates
```

## Public-safe prompt policy

Agent prompts describe role and behavior only. They must never include secrets, private paths, credentials, hidden provider names, or customer-private data.

Newly created agents receive no sensitive `capabilityGrants` by default. Operators must explicitly grant permissions in a later governance flow.

## Current files

- `src/features/office/OfficeExperience.tsx` — fixed RTS camera, selected agent, optimistic + persisted move targets, lane request focus.
- `src/features/office/scene/OfficeScene.tsx` — floor clicks, move markers, zone request stations.
- `src/features/office/hud/GoalComposer.tsx` — lane-filtered task creation, template-based staff creation, prompt preview.
- `src/features/office/hud/AgentPanel.tsx` — persona/prompt display.
- `packages/contracts/src/index.mjs` — `task.create`, `agent.create`, `agent.move.requested` commands and related events.
- `packages/runtime/src/index.mjs` — task creation, movement lifecycle, safe demo agent creation handlers.
- `packages/domain/src/index.mjs` — default role persona/prompt templates and role-template catalog.

## Next real-runtime upgrade

The next step is replacing mock execution with a real streaming agent worker:

```txt
task.created
  -> agent.run.queued
  -> agent.run.started
  -> agent.stream.delta*
  -> approval.requested?
  -> agent.run.completed
```

The RTS office should continue consuming projections only; it should not call tools or mutate business state directly.
