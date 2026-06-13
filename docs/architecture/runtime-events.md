# Runtime Commands and Events

BINDERY BOX runtime behavior must be driven by explicit commands and emitted events. This prevents the platform from becoming a direct UI-to-state demo app and creates a foundation for workers, queues, audit, retries, Mattermost sync, and hosted/on-prem deployments.

## Runtime Invariant

```txt
Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Project to UI / Office
```

Rules:

1. Mission Control and Mattermost submit commands.
2. Runtime evaluates policy before side effects.
3. Runtime emits events for every important transition.
4. Data-store persists events/state.
5. Projection layers update Mission Control and Office surfaces.
6. Audit events are append-only.

## Command Categories

### Workspace Commands

```ts
type WorkspaceCommand =
  | {
      type: "workspace.create";
      tenantId: string;
      name: string;
      slug?: string;
      editionId?: string;
      requestedBy: string;
    }
  | {
      type: "workspace.archive";
      workspaceId: string;
      requestedBy: string;
    };
```

### Agent Commands

```ts
type AgentCommand =
  | {
      type: "agent.deploy";
      workspaceId: string;
      definitionId: string;
      name: string;
      requestedBy: string;
    }
  | {
      type: "agent.update-capabilities";
      agentId: string;
      capabilityGrants: string[];
      requestedBy: string;
    }
  | {
      type: "agent.disable";
      agentId: string;
      requestedBy: string;
    };
```

### Task Commands

```ts
type TaskCommand =
  | {
      type: "task.create";
      workspaceId: string;
      title: string;
      description?: string;
      assignedAgentId?: string;
      priority?: "low" | "normal" | "high" | "urgent";
      requestedBy: string;
    }
  | {
      type: "task.run";
      taskId: string;
      requestedBy: string;
    }
  | {
      type: "task.cancel";
      taskId: string;
      reason: string;
      requestedBy: string;
    };
```

### Approval Commands

```ts
type ApprovalCommand =
  | {
      type: "approval.decide";
      approvalId: string;
      decision: "approved" | "rejected";
      comment?: string;
      decidedBy: string;
    };
```

### Connector Commands

```ts
type ConnectorCommand =
  | {
      type: "connector.install";
      workspaceId: string;
      connectorId: string;
      configRef: string;
      secretRefs?: string[];
      requestedBy: string;
    }
  | {
      type: "connector.disable";
      connectorInstallationId: string;
      requestedBy: string;
    };
```

## Event Categories

### Workspace Events

```ts
type WorkspaceEvent =
  | {
      type: "workspace.created";
      workspaceId: string;
      tenantId: string;
      name: string;
      occurredAt: string;
    }
  | {
      type: "workspace.archived";
      workspaceId: string;
      occurredAt: string;
    };
```

### Agent Events

```ts
type AgentEvent =
  | {
      type: "agent.deployed";
      agentId: string;
      workspaceId: string;
      definitionId: string;
      occurredAt: string;
    }
  | {
      type: "agent.status.changed";
      agentId: string;
      status: "idle" | "running" | "blocked" | "disabled";
      occurredAt: string;
    }
  | {
      type: "agent.capabilities.updated";
      agentId: string;
      capabilityGrants: string[];
      occurredAt: string;
    };
```

### Task Events

```ts
type TaskEvent =
  | {
      type: "task.created";
      taskId: string;
      workspaceId: string;
      assignedAgentId?: string;
      occurredAt: string;
    }
  | {
      type: "task.run.started";
      taskRunId: string;
      taskId: string;
      agentId: string;
      occurredAt: string;
    }
  | {
      type: "task.run.completed";
      taskRunId: string;
      taskId: string;
      resultSummary: string;
      occurredAt: string;
    }
  | {
      type: "task.run.failed";
      taskRunId: string;
      taskId: string;
      error: string;
      occurredAt: string;
    };
```

### Tool Events

```ts
type ToolEvent =
  | {
      type: "tool.call.requested";
      toolCallId: string;
      taskRunId: string;
      agentId: string;
      connectorInstallationId?: string;
      toolName: string;
      capabilities: string[];
      occurredAt: string;
    }
  | {
      type: "tool.call.blocked";
      toolCallId: string;
      reason: string;
      occurredAt: string;
    }
  | {
      type: "tool.call.pending-approval";
      toolCallId: string;
      approvalId: string;
      occurredAt: string;
    }
  | {
      type: "tool.call.completed";
      toolCallId: string;
      outputPreviewRef?: string;
      occurredAt: string;
    };
```

### Approval Events

```ts
type ApprovalEvent =
  | {
      type: "approval.requested";
      approvalId: string;
      workspaceId: string;
      taskRunId: string;
      toolCallId?: string;
      reason: string;
      occurredAt: string;
    }
  | {
      type: "approval.decided";
      approvalId: string;
      decision: "approved" | "rejected";
      decidedBy: string;
      occurredAt: string;
    };
```

### Office Events

```ts
type OfficeEvent =
  | {
      type: "office.team.synced";
      workspaceId: string;
      officeRef: string;
      occurredAt: string;
    }
  | {
      type: "office.message.posted";
      workspaceId: string;
      channelRef: string;
      messageRef: string;
      sourceEventId: string;
      occurredAt: string;
    };
```

### Audit Events

```ts
type AuditEvent = {
  type: "audit.appended";
  auditEventId: string;
  tenantId: string;
  workspaceId: string;
  actorType: "human" | "agent" | "system";
  actorId: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  summary: string;
  occurredAt: string;
};
```

## Command Handler Shape

Runtime command handlers should follow this conceptual flow:

```txt
handleCommand(command):
  1. validate command schema
  2. load relevant state from data-store
  3. evaluate policy and capabilities
  4. emit blocked / approval / started events as needed
  5. execute side effect only if allowed
  6. emit completed / failed events
  7. persist events and audit records
```

## Projection Shape

Mission Control should read projection endpoints such as:

```txt
GET /api/workspaces/:id/overview
GET /api/workspaces/:id/tasks
GET /api/workspaces/:id/approvals
GET /api/workspaces/:id/audit-events
GET /api/workspaces/:id/live-log
```

The UI should not be coupled to runtime internal state files.

### Live Operations Log

`GET /api/workspaces/:id/live-log` projects the four activity planes —
runtime events, agent task runs (the agent picking up work + its produced
answer), the audit trail, and Mattermost office posts — into a single
time-ordered (newest-first) stream so the client can watch agents being
invoked in real time, including in the stateless cloud demo. Each entry is
`{ id, ts, source, level, actor, channel, action, message }` where `source`
is one of `runtime | agent | audit | office` and `level` is one of
`info | success | running | pending | error`. The response also carries
`{ generatedAt, total, returned, counts }`. The Control Room polls this
endpoint every 2.5s (with a manual refresh + auto-refresh toggle); running a
task or deciding an approval makes the stream grow immediately.

## Office Sync Shape

Mattermost office sync listens to events and posts collaboration artifacts:

```txt
task.created -> task thread / channel post
task.run.completed -> result summary post
approval.requested -> approval channel post
approval.decided -> decision update
audit.appended -> optional audit digest
```

## Next Implementation Requirements

Before adding complex feature work:

1. Create `packages/contracts` for these commands/events.
2. Add validation helpers.
3. Update runtime so `task.run` flows through command/event handling.
4. Add a mock Office adapter that consumes events.
5. Add boundary checks to prevent UI importing runtime internals directly.
