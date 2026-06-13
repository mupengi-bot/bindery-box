# Real Agent Runtime + Human Messenger Integration

BINDERY BOX / MUFI Box should feel like a real AI company office: humans talk in familiar messenger rooms, agents work as visible staff in the Claw3D office, and Mission Control stays as the operator/control layer.

## North-star product loop

```txt
Human message / Goal Composer
  -> Command
  -> Policy + routing
  -> Agent runtime job
  -> Agent stream / tool events
  -> Event store + audit
  -> 3D office projection + messenger thread + Mission Control sheet
  -> Human approval / follow-up
```

The key product rule is: **messenger is where people collaborate, 3D office is where work becomes visible, Mission Control is where operators govern.**

## Planes

| Plane | Role | Owns | Must not own |
| --- | --- | --- | --- |
| Human Office Plane | Messenger channels, DMs, threads, mentions, files | human conversation, channel routing, visible collaboration | runtime secrets, direct tool execution |
| 3D Office Plane | Claw3D-style spatial state | rooms, agent positions, huddles, approval room, lightweight HUD | canonical task state |
| Control Plane | API, commands, policy decisions, projections | command lifecycle, approvals, visible state | provider-specific runtime internals |
| Runtime Plane | agent workers and tool execution | agent job queue, streaming output, tool calls, retries | UI layout, messenger formatting |
| Data Plane | append-only events + current projections | tasks, runs, approvals, audit, identities | raw private credentials |
| Connector Plane | customer systems | connector manifests, scoped capability grants | direct UI decisions |
| Policy Plane | governance | approval rules, capability checks, human gates | transport-specific formatting |

## Identity model

### Human identity

A human may appear through multiple surfaces, but must resolve to one `HumanUser` record.

```txt
HumanUser
- id: user_*
- tenantId
- displayName
- role: owner | operator | approver | viewer
- messengerIdentities[]: { provider, teamRef, userRef, handle }
- missionControlIdentityRef?
```

Rules:

1. Messenger user references are external IDs, never primary IDs.
2. A human can approve only if Policy Plane grants `approval.decide` for the workspace/task class.
3. DMs are treated as private channels but still produce auditable command metadata.

### Agent identity

An agent has three related identities:

```txt
AgentDefinition  -> role/template/capabilities
AgentInstance    -> workspace staff member
OfficeIdentity   -> messenger bot/profile + 3D avatar identity
```

```txt
AgentInstance
- id: agent_*
- workspaceId
- definitionId
- displayName
- role
- lane: production | sales | scope3 | control | custom
- status: idle | running | blocked | disabled
- officeIdentityRef
- messengerIdentityRef?
- capabilityGrants[]
```

Rules:

1. Agents do not speak directly as humans.
2. Every agent message is traceable to a run/event.
3. Agent avatars are projection-only; they do not mutate tasks directly.

## Messenger architecture

### Default office mapping

```txt
Tenant / Workspace -> messenger team/server/workspace
Department lane    -> channel
Task               -> thread
Approval           -> approval thread + Mission Control link
Agent              -> bot/user profile or named poster identity
Human              -> actual messenger member
```

Recommended default channels:

| Channel | Purpose | 3D mapping |
| --- | --- | --- |
| `#general` | announcements and daily summary | central plaza |
| `#tasks` | task creation/results | mission board |
| `#approvals` | human-gated decisions | Human Gate meeting room |
| `#production` | production lane work | Production room |
| `#sales` | sales lane work | Sales room |
| `#scope3` | ESG/supply-chain lane work | Scope 3 room |
| `#ops-control` | incidents, connector/runtime alerts | Control room |

### Message ingestion

Inbound messenger events are normalized into a `user.message.ingest` command.

```txt
messenger webhook
  -> verify signature / source
  -> resolve HumanUser + Workspace + Channel
  -> classify intent
  -> create command
  -> policy check
  -> create task or append to thread
```

A message should create a task only when it contains an actionable goal. Otherwise it should be stored as conversation context.

### Message routing

| Incoming context | Default behavior |
| --- | --- |
| DM to agent | create private task or ask clarifying question |
| Mention in department channel | route to matching lane agent |
| Message in task thread | append to task context |
| Approval reply | route to `approval.decide` if human is authorized |
| File upload | create knowledge-ingest request, not immediate unrestricted file access |
| Slash command / button | create explicit command with policy metadata |

## Real agent runtime lifecycle

### Job lifecycle

```txt
task.created
  -> agent.run.queued
  -> agent.run.started
  -> agent.stream.delta*        (optional, visible in live process)
  -> tool.call.requested*       (policy checked)
  -> approval.requested?        (if gated)
  -> agent.run.completed | agent.run.failed | agent.run.cancelled
  -> task.run.completed | task.run.failed
```

### Runtime adapter contract

The runtime adapter is transport-neutral. It accepts jobs, streams events, and never writes UI state directly.

```ts
interface AgentRuntimeAdapter {
  enqueue(job: AgentJob): Promise<{ runId: string }>;
  cancel(runId: string, reason: string): Promise<void>;
  subscribe(runId: string, onEvent: (event: RuntimeEvent) => void): () => void;
  health(): Promise<RuntimeHealth>;
}
```

`AgentJob` minimum shape:

```txt
- id
- workspaceId
- taskId
- agentId
- requestedBy
- goal
- contextRefs[]
- capabilityGrants[]
- policySnapshot
- createdAt
```

## Command lifecycle

### From Goal Composer

```txt
1. User types goal in 3D office HUD.
2. Control Plane emits task.create.
3. Policy Plane selects approval/tool constraints.
4. Agent router picks candidate agent by lane/capabilities/load.
5. Runtime enqueues AgentJob.
6. 3D office moves agent: desk -> huddle.
7. Messenger posts task thread in appropriate channel.
8. Live process stream summarizes progress.
```

### From messenger

```txt
1. Human writes message or mentions agent.
2. Office adapter normalizes inbound event.
3. Control Plane resolves identity + workspace + channel.
4. Intent classifier selects: create task, append context, decide approval, or ask clarification.
5. Command runs through policy/runtime exactly like Goal Composer.
6. Result returns to messenger thread and 3D office projection.
```

### From approval room

```txt
1. Agent hits human gate.
2. Event: approval.requested.
3. 3D office routes agent to central meeting room.
4. Messenger posts approval card in #approvals or task thread.
5. Human approves/rejects in messenger or Mission Control.
6. Event: approval.decided.
7. Runtime resumes or cancels.
```

## 3D projection rules

3D is not the source of truth. It consumes projections:

| Runtime state | 3D behavior |
| --- | --- |
| idle | agent at desk |
| run queued | desk status halo |
| run started / streaming | route to department huddle |
| waiting approval | route to Human Gate meeting room |
| blocked | desk, red slow pulse, “입력 필요” label |
| failed | control room alert + incident beat |
| completed | return to desk + result badge |

This is already aligned with `src/features/office/routing.ts`; real runtime should feed the same `workstream` shape instead of adding renderer-only state.

## Messenger UX

### Human view

Humans should not need to learn the platform first. They use normal messenger patterns:

```txt
@생산팀장 이번 주 생산 리스크 요약해서 승인안 만들어줘
@영업리더 미수금 위험 높은 고객 5개만 뽑아줘
/approve apv_123 좋음, 진행
```

### Agent reply style

Agent replies should be short, operational, and thread-based:

```txt
접수했어. 생산 리스크 점검을 시작할게.
- 담당: 생산팀장
- 예상 산출물: 리스크 요약 + 승인안
- 승인 필요: 외부 발송 전 1회
```

Progress replies should be throttled. Detailed logs stay in Mission Control.

### Notification levels

| Level | Messenger behavior | 3D behavior |
| --- | --- | --- |
| info | thread update only | small bubble |
| success | result summary | completion badge |
| warn | channel notice if human action needed | Human Gate route |
| error | ops-control alert | Control room pulse |

## Security and privacy

1. All inbound webhooks require signature verification before command creation.
2. Messenger tokens are secret references only, never committed or exposed in projections.
3. File uploads are converted to knowledge-ingest requests; agents get scoped references, not raw unrestricted paths.
4. Every command stores `requestedBy`, `source`, `surface`, and `correlationId`.
5. Tool calls are policy-checked before execution.
6. Human approvals are append-only audit events.
7. Messenger DMs should be visible only to authorized operators in Mission Control.
8. Agent output should be redacted before posting to human channels if it contains secrets or private paths.

## Failure modes

| Failure | Product behavior |
| --- | --- |
| Messenger webhook down | Mission Control still works; show office adapter degraded |
| Runtime worker down | task remains queued; agent avatar shows blocked/control alert |
| Agent run timeout | emit `agent.run.failed`, post concise thread notice |
| Approval not answered | reminder schedule + Human Gate badge |
| Connector permission denied | request approval or show capability missing |
| Duplicate message webhook | dedupe by provider event id/correlation id |
| User not mapped | create pending identity link request, do not run task |

## MVP sequence

### Slice 1 — Mock messenger contract

- Add messenger event/command contracts.
- Add mock inbound message endpoint.
- Project inbound message into workstream/live-log.
- No external messenger network calls.

### Slice 2 — Real runtime adapter boundary

- Add `AgentRuntimeAdapter` interface.
- Add local worker adapter that simulates streaming events.
- Replace direct demo task mutation with queued run lifecycle.

### Slice 3 — Mattermost-compatible office adapter

- Add real connector configuration using secret refs.
- Ingest webhooks.
- Post task thread updates and approval cards.

### Slice 4 — 3D + messenger sync

- Agent route reacts to run lifecycle.
- Messenger thread URL appears in agent panel / mission sheet.
- Clicking an agent shows current task thread and last human message.

### Slice 5 — Production governance

- Policy rules per channel/task/tool.
- Approval reminders and escalation.
- Retention controls for DMs/files/logs.

## Minimal API surface

```txt
POST /api/office/messages/ingest
GET  /api/workspaces/:id/office/threads
GET  /api/workspaces/:id/runtime/runs
POST /api/runtime/runs/:id/cancel
POST /api/approvals/:id/decision
```

The existing endpoints remain:

```txt
GET /api/workspaces/:id/workstream
GET /api/workspaces/:id/live-log
POST /api/tasks/:id/run
```

## Implementation invariant

Do not let messenger adapters, 3D scene components, or runtime workers bypass the Control Plane. All roads go through:

```txt
Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection
```
