# RTS Office Interaction Model

BINDERY BOX uses the Claw3D office as an RTS-like operating board: the camera is stable, staff are selectable units, right-click expresses persisted movement commands, and department zones are work-request surfaces.

## UX invariants

1. **Fixed camera first** — the default view is an isometric office board. Free orbit is not the primary interaction.
2. **Select unit, preview, then command** — clicking an agent selects that person. Hovering the floor while selected shows a move preview ring/route line. Right-clicking the floor or a station coordinate creates `agent.move.requested`, records a target, and projects the avatar there. Left-clicking empty floor cancels the current command/selection mode instead of moving the unit.
3. **No autonomous walking** — runtime status (`running`, `waiting_approval`, `blocked`) may change colors, panels, logs, and desk activity, but it must not move a person. Physical movement only happens from an explicit operator coordinate command.
4. **Zones are actionable** — every department room has a visible `＋ 업무 요청` station. Clicking a station opens the Goal Composer filtered to that lane.
5. **Zone requests create real tasks** — typed zone requests go through `task.create`, produce `task.created`, and surface as runnable missions.
6. **People expose role prompts** — selecting a person opens a card with role, persona, capabilities, KPI, active mission, and public-safe prompt text.
7. **People can be created from templates** — the composer exposes role templates, prompt previews, and safe default permissions.
8. **Commands remain projections** — movement, work requests, and hires go through `Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection`.
9. **First win before cockpit complexity** — first-time users see a goal composer and generic lane cards before they have to understand logs, connectors, or policies.
10. **Observable but not noisy** — the default HUD shows next best action and performance board; raw event detail stays in Live Process and sheets.
11. **Characters must read as MUFI penguins by role** — staff are lightweight procedural penguins with black oval bodies, white bellies, orange beaks/feet, deterministic per-agent hat colors, and lane-specific desk/work accessories: Engineering laptop/visor badge, Legal document badge, Operations vest/tablet, Control command badge.
12. **Follow is optional focus, not free-camera drift** — `직원 따라가기` smoothly tracks the selected staff member while keeping the isometric RTS mental model.
13. **Arrival needs feedback** — a completed movement command emits a short non-persisted pulse so operators feel the command completed without confusing it with business state.
14. **Map control must be explicit** — mouse right-click remains movement, so board rotation is provided through visible `시점 회전` / `시점 리셋` controls. Left-drag pans the board and wheel zooms.
15. **Move markers are ephemeral** — `이동 좌표` markers represent pending intent only. Once the penguin reaches the coordinate, the marker disappears and only the arrival pulse remains.
16. **Cognition must be projected, not imagined** — a penguin's visible “mind” must be fed from business state: current goal, memory/context, decision queue, required approval, confidence/risk, and next action. These show as head/desk signals, but canonical state remains in the Control Plane.
17. **Physical location is not business state** — a penguin's floor coordinate is an operator-commanded office-board placement. It may help spatial organization, but the actual work linkage lives in cognition packets, desk signals, HUD cards, mission events, artifacts, and approval boundaries.

## Character and 3D interaction upgrade plan

The 3D office converges toward `RTS command board + living staff simulator`:

1. **Penguin silhouette layer** — distinguish staff through a shared MUFI penguin body, deterministic hat colors, and lightweight procedural accessories rather than heavy GLTF dependency first.
2. **Pointer taxonomy** — right-click floor means move, left-click empty floor means cancel command/selection mode, agent means inspect/select, station means create task, meeting room means approval, artifact means open result, connector means inspect integration.
3. **Intent before command** — hover previews stay local and non-persisted; only explicit click/right-click commands enter the Control Plane.
4. **Feedback after command** — movement arrival pulse, desk/run beacons, and station hover chips show cause/effect without adding noisy points or streaks.
5. **Camera support** — default is fixed isometric; optional follow mode helps users watch one AI employee work.
6. **Visual comfort first** — the default surface is a warm daylight office, not a dark control room. Night Ops remains a toggle for low-light work.
7. **Selective accent** — large surfaces use warm neutrals; only status, approval, warning, and active targets use saturated color.
8. **Readable typography** — use product-safe Korean/Latin sans fonts and avoid tiny high-contrast metadata as the default reading mode.

## Agent cognition projection

The 3D penguin is not a decoration. Each visible cognitive cue is backed by platform state through `projectOfficeSignals` and `AgentCognition`:

```txt
Business event / runtime state
  -> Control Plane projection
  -> agent cognition packet
  -> head/desk signal in 3D office
  -> HUD detail when selected
```

Minimum cognition fields:

- `goal`: what this penguin is trying to accomplish now.
- `context`: memory/doc/thread/run references being used.
- `decision`: current reasoning checkpoint or next best action.
- `risk`: confidence, approval requirement, blocker, or policy boundary.
- `output`: artifact/run result when work completes.

Visual mapping:

- head beacon = thinking/risk/approval state.
- cognition bubble = label + current decision, visible above the penguin and expanded when selected.
- desk signals = runs, artifacts, threads, and tool outputs.
- selected card = role prompt, current goal, active mission, approvals, public-safe reasoning summary, and the same cognition packet fields.
- movement = operator intent only; it must not imply autonomous reasoning unless a persisted command exists.

## Visual comfort palette

Default `comfort` mode uses a calm office palette:

```txt
Canvas / fog     #f5f2ea
Floor            #e8e1d4
Panel glass      rgba(255,252,245,0.84)
Text             #1f2933
Muted text       #667085
Accent blue      #2563eb
Success green    #059669
Warning amber    #d97706
```

`night` mode is preserved as **Night Ops** for low-light operation, but it is no longer the first impression.

## Interaction flow

### Move an agent

```txt
click agent
  -> selectedAgentId
hover floor coordinate
  -> non-persisted blue preview ring + route line
right-click floor coordinate or right-click station coordinate
  -> optimistic local marker
  -> POST /api/agents/:id/move
  -> command: agent.move.requested
  -> policy check
  -> event: agent.move.accepted
  -> event: agent.move.projected
  -> workstream agent.moveTarget
  -> avatar route override after refresh

left-click empty floor
  -> clear selectedAgentId
  -> hide non-persisted move preview/follow mode
  -> no movement command is persisted
```

The UI remains immediate, but the canonical state is persisted on the agent projection.

### Request work from a zone

```txt
left-click department work station
  -> Goal Composer opens
  -> lane filter is set
  -> request text is prefilled
right-click department work station with a selected person
  -> move selected person to that station without opening the composer
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
