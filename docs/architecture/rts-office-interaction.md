# RTS Office Interaction Model

BINDERY BOX uses the Claw3D office as an RTS-like operating board: the camera is stable, staff are selectable units, floor clicks express movement intent, and department zones are work-request surfaces.

## UX invariants

1. **Fixed camera first** — the default view is an isometric office board. Free orbit is not the primary interaction.
2. **Select unit, then command** — clicking an agent selects that person. Clicking the floor creates an `agent.move.requested`-style UI intent and moves the selected avatar toward that coordinate.
3. **Zones are actionable** — every department room has a visible `＋ 업무 요청` station. Clicking a station opens the Goal Composer filtered to that lane.
4. **People expose role prompts** — selecting a person opens a card with role, persona, capabilities, KPI, active mission, and public-safe prompt text.
5. **People can be created** — the composer can create a new demo staff member through `agent.create`. Created agents start with no sensitive capability grants.
6. **Commands remain projections** — movement and request UX must not bypass `Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection` when wired to real runtime.

## Interaction flow

### Move an agent

```txt
click agent
  -> selectedAgentId
click floor/zone coordinate
  -> UI move target marker
  -> avatar route override
future: POST agent.move.requested command
```

The current implementation is UI-local so it is safe and immediate. The command naming is reserved for real runtime wiring.

### Request work from a zone

```txt
click department work station
  -> Goal Composer opens
  -> lane filter is set
  -> request text is prefilled
  -> operator dispatches matching mission or creates a future task
```

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
  -> POST /api/workspaces/:id/agents
  -> command: agent.create
  -> event: agent.created
  -> workstream projection shows new staff member
```

## Public-safe prompt policy

Agent prompts describe role and behavior only. They must never include secrets, private paths, credentials, hidden provider names, or customer-private data.

Newly created agents receive no sensitive `capabilityGrants` by default. Operators must explicitly grant permissions in a later governance flow.

## Current files

- `src/features/office/OfficeExperience.tsx` — fixed RTS camera, selected agent, move targets, lane request focus.
- `src/features/office/scene/OfficeScene.tsx` — floor clicks, move markers, zone request stations.
- `src/features/office/hud/GoalComposer.tsx` — lane-filtered requests and demo staff creation.
- `src/features/office/hud/AgentPanel.tsx` — persona/prompt display.
- `packages/contracts/src/index.mjs` — `agent.create` command and `agent.created` event.
- `packages/runtime/src/index.mjs` — safe demo agent creation handler.
- `packages/domain/src/index.mjs` — default role persona/prompt templates.

## Next real-runtime upgrade

Replace UI-local movement with persisted command/event flow:

```txt
agent.move.requested
  -> policy: is operator allowed to direct this agent?
  -> event: agent.move.accepted
  -> projection: office avatar target
```

Replace lane request prefill with real task creation:

```txt
zone.work-request.created
  -> task.create
  -> agent router
  -> agent.run.enqueue
```
