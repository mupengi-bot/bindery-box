# Multi-user hardware path

BINDERY BOX must be usable by more than one person on a local appliance, not only as a single-user demo page.

## Product path

```txt
Human user
  -> role / session
  -> workspace
  -> hardware route
  -> Control Plane endpoint
  -> runtime or human-office action
  -> event store
  -> 3D office / Mission Control projection
```

The appliance is a route host, not the source of business truth. Users, roles, sessions, hardware nodes, and access routes are Control Plane state and must be projected to the UI.

## Entities

| Entity | Owns | Notes |
| --- | --- | --- |
| `HumanUser` | person identity, role, messenger identity refs | external IDs are not primary IDs |
| `HardwareNode` | appliance/runtime host identity | stores endpoint refs only, never raw credentials |
| `AccessRoute` | which surface is exposed through which node | maps owner/operator/system audiences to safe paths |
| `Workspace` | tenant-scoped company office | every user and hardware route resolves through a workspace |

## Default surfaces

| Surface | Path | Audience | Auth mode |
| --- | --- | --- | --- |
| Mission Control | `/` | owner | local session |
| Human Office ingest | `/api/office/messages/ingest` | operator | signed webhook |
| Runtime runs | `/api/workspaces/default/runtime/runs` | system | service token ref |

## API surface

```txt
GET /api/workspaces/:id/access-topology
GET /api/hardware/routes
```

These endpoints return public-safe route metadata only. Secret values, raw tokens, private filesystem paths, and provider-specific keys must stay behind secret refs.

## Guardrails

- No UI component may infer a hardware path locally.
- Messenger adapters must enter through `user.message.ingest`.
- Runtime workers must enter through runtime run commands/events.
- Hardware nodes may host routes, but cannot mutate tasks, approvals, or artifacts directly.
- Multi-user access is role-based: `owner`, `operator`, `approver`, `viewer`, `system`.
- Appliance mode should work on LAN first; cloud/public exposure is a deployment option, not a different product core.
