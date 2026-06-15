# BINDERY BOX Architecture

BINDERY BOX is an AI Company-in-a-Box platform. The main surface is a Claw3D-style office; people collaborate through the Human Office messenger bridge; operators govern through Mission Control; agents execute through the Runtime Plane.

## Current alpha boundary

The runnable alpha exists to validate the product loop, but all real work must keep the platform invariant:

```txt
Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection
```

No UI, connector, messenger adapter, runtime worker, or hardware node may mutate canonical business state directly.

## Platform architecture docs

- [Platform-first architecture](architecture/platform-first-architecture.md)
- [Domain model](architecture/domain-model.md)
- [Runtime commands and events](architecture/runtime-events.md)
- [Real agent + messenger integration](architecture/real-agent-messenger-integration.md)
- [Multi-user hardware path](architecture/multi-user-hardware-path.md)

## Planes

1. **Control Plane** — tenants, workspaces, users, commands, policies, projections.
2. **3D Office Plane** — visible agents, desks, runs, approvals, artifacts.
3. **Human Office Plane** — messenger channels, threads, mentions, files.
4. **Runtime Plane** — run queue, streaming events, cancellation, retries.
5. **Connector Plane** — external system manifests and scoped grants.
6. **Data Plane** — event store, projections, audit, knowledge/artifact refs.
7. **Policy Plane** — approvals, capability checks, human gates.
8. **Hardware/Appliance Plane** — LAN route host, local runtime, update/start/stop lifecycle.

## Default lanes

Core lanes are generic and should remain product-wide:

```txt
engineering | legal | operations | control
```

Industry presets can be added later as templates, not as hardcoded core behavior.
