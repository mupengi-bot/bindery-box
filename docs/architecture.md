# BINDERY BOX Architecture

BINDERY BOX is an AI Company-in-a-Box platform. The visual office is Mattermost, the operator surface is Mission Control Web, and the runtime executes agent tasks with approval, policy, connector, and audit boundaries.

## Current Alpha Is a Prototype

The current runnable Alpha slice proves the product shape, but it is not the final platform architecture:

- `apps/web` is a prototype Mission Control surface.
- `apps/api` is a prototype local API.
- `packages/runtime` currently simulates task execution and approvals.
- `examples/manufacturing-demo` is demo data for the first vertical.

Before large feature work, the platform must be split into explicit domain, contract, policy, data-store, office, connector, and runtime boundaries.

## Platform Architecture Docs

- [Platform-first architecture](architecture/platform-first-architecture.md)
- [Domain model](architecture/domain-model.md)
- [Runtime commands and events](architecture/runtime-events.md)

## Target Planes

1. **Mission Control Web** — org chart, tasks, approvals, audit, KPI, configuration.
2. **Control Plane API** — tenants, workspaces, agents, policies, connectors, deployments.
3. **Runtime Plane** — orchestration, workers, task runs, tool calls, scheduler.
4. **Office Plane** — Mattermost teams, channels, agent identities, approval threads.
5. **Connector Hub** — files, CSV, email, GitHub, ERP/MES, webhooks, MCP-compatible tools.
6. **Data Plane** — SQLite/Postgres, object files, audit log, knowledge graph.
7. **Desktop / Appliance Plane** — install, start/stop, updates, secrets, local permissions.

## Runtime Invariant

```txt
Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Project to UI / Office
```

No direct UI mutation of business state. No connector side effect without capability grants. No sensitive external action without approval policy evaluation.

## First Vertical

Manufacturing Edition remains the first product preset:

- Production Leader
- Sales Leader
- Scope 3 Leader
- Ops Controller

This vertical should migrate into `editions/manufacturing` as a preset, not stay hardcoded into app/runtime logic.
