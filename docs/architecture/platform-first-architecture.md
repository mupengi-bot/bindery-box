# Platform-First Architecture

BINDERY BOX / MUFI Box is an installable AI Company-in-a-Box platform, not a single dashboard and not a demo chatbot bundle. The platform must run many tenants, many workspaces, many visible agent staff members, and many controlled tool/connector executions across local, appliance, and hosted deployments.

## Current Alpha Status

The current runnable Alpha slice is intentionally a prototype:

- `apps/web` renders a Mission Control-style dashboard.
- `apps/api` exposes a local HTTP API.
- `packages/runtime` simulates task execution, approvals, runtime events, and audit events.
- `apps/desktop` previews launcher responsibilities.

This Alpha proves the product shape, but it is **not** the final platform architecture. Do not add large product features on top of the prototype flow until the platform boundaries below are implemented.

## Product Principle

> Install a small AI company inside the customer's environment.

The system must support:

1. Multiple tenants / customer companies
2. Multiple workspaces per tenant
3. Multiple agent instances per workspace
4. Agents visible in Mattermost as staff members
5. Agent execution controlled by capability and approval policies
6. Tool and connector permissions
7. Human approvals before sensitive actions
8. Full append-only audit trail
9. Local, appliance, and hosted deployment modes
10. Generic core lanes first; industry presets remain templates, not product limits

## Planes

```txt
┌────────────────────────────────────────────────────────────┐
│                   Mission Control Web                      │
│  org chart · tasks · approvals · audit · KPI · config      │
└───────────────────────────┬────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼────────────────────────────────┐
│                    Control Plane API                       │
│ tenants · workspaces · agents · policies · connectors      │
└─────────────┬───────────────────────┬──────────────────────┘
              │                       │
              │ runtime commands      │ office sync/events
              │                       │
┌─────────────▼─────────────┐   ┌────▼───────────────────────┐
│      Runtime Plane        │   │      Office Plane           │
│ orchestration · workers   │   │ Mattermost teams/channels   │
│ task runs · tool calls     │   │ messages · approvals        │
└─────────────┬─────────────┘   └────┬───────────────────────┘
              │                      │
              │ tool requests         │ connector events
              │                      │
┌─────────────▼──────────────────────▼───────────────────────┐
│                    Connector Hub                           │
│ files · csv · email · github · erp/mes · webhook · mcp      │
└─────────────┬──────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────┐
│                       Data Plane                           │
│ SQLite/Postgres · object files · audit log · knowledge      │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ Desktop Launcher / Appliance Manager                       │
│ install · start/stop · updates · secrets · local perms      │
└────────────────────────────────────────────────────────────┘
```

### Control Plane

The Control Plane owns product configuration and orchestration entry points:

- tenants
- workspaces
- human users
- agent definitions and deployed agent instances
- connector installations
- policy configuration
- deployment status
- projected overviews for Mission Control

It receives commands from Mission Control, Mattermost, desktop, scheduler, or external webhooks. It should not directly mutate runtime internals without command/event handling.

### Runtime Plane

The Runtime Plane performs work:

- task runs
- agent status transitions
- tool call requests
- worker execution
- scheduler-triggered runs
- result generation
- event emission

Runtime actions must pass through capability and approval policy checks before side effects happen.

### Office Plane

The Office Plane makes the AI company visible to humans. Mattermost is the default office surface.

Mapping:

```txt
Tenant / Workspace -> Mattermost team
Department -> Mattermost channel
AgentInstance -> bot identity or webhook persona
Task -> thread
ApprovalRequest -> approval post with Mission Control link
AuditEvent -> optional digest in audit channel
```

Mission Control remains the system of record; Mattermost is the collaboration surface.

### Connector Plane

The Connector Hub provides controlled access to external/internal systems:

- filesystem
- CSV/import folders
- email
- GitHub
- ERP/MES
- webhooks
- MCP-compatible tools
- future customer systems

Each connector must declare capabilities and policy-sensitive operations.

### Data Plane

The Data Plane stores state and evidence:

- canonical relational state
- append-only audit events
- task run records
- tool call records
- knowledge documents
- object/file storage
- secret references

Local MVP can use SQLite and local object folders. Appliance/hosted modes can move to Postgres and S3-compatible object storage.

### Desktop / Appliance Plane

The desktop app or appliance manager manages local services; it must not become the business logic layer.

Responsibilities:

- install dependencies
- start/stop local stack
- check ports and service health
- open Mission Control and Mattermost
- manage local secrets and diagnostic export
- handle updates
- request OS-level permissions where needed

## Required Repository Shape

Target direction:

```txt
bindery-box/
├─ apps/
│  ├─ mission-control/
│  ├─ control-api/
│  ├─ worker/
│  ├─ desktop/
│  └─ docs-site/
├─ packages/
│  ├─ domain/
│  ├─ contracts/
│  ├─ config/
│  ├─ policy/
│  ├─ runtime/
│  ├─ scheduler/
│  ├─ agents/
│  ├─ connectors/
│  ├─ office-mattermost/
│  ├─ data-store/
│  ├─ knowledge/
│  ├─ observability/
│  └─ ui/
├─ editions/
│  ├─ presets/
│  └─ general-office/
├─ examples/
├─ infra/
└─ docs/
```

Migration direction:

- `apps/web` -> `apps/mission-control`
- `apps/api` -> `apps/control-api`
- `packages/core` -> `packages/domain`
- `packages/runtime` remains but loses demo-specific hardcoding
- industry demos become optional preset data, never core behavior

## Platform Invariant

All mutating flows should follow this shape:

```txt
Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Project to UI / Office
```

No direct UI mutation of business state. No connector side effect without capability grants. No sensitive external action without approval policy evaluation.

## Feature Freeze Rule

Until the domain model, command/event contracts, data-store boundary, policy engine, and office adapter contract exist, new feature work should be limited to architecture, contracts, tests, and migration scaffolding.
