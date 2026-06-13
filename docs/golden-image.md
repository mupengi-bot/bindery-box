# Golden Image — BINDERY BOX Core Identity

The Golden Image is the product identity BINDERY BOX / MUFI Box must preserve as it evolves.

```txt
BINDERY BOX = a Claw3D-style 3D AI company office
where the original platform architecture runs behind the interface.
```

## Canonical source

The source of truth is code:

```txt
packages/golden-image/src/index.mjs
```

The API serves it through:

```txt
GET /api/golden-image
GET /api/workspaces/default/golden-image
```

The committed snapshot is:

```txt
docs/golden-image/manifest.json
```

## Core identity

- **3D Office / Claw3D frontstage** — the app boots into the living office, not a dashboard.
- **Human Office / Messenger** — humans collaborate in familiar channels, DMs, and threads.
- **Mission Control backstage** — approvals, connectors, knowledge, logs, and governance open by progressive disclosure.
- **Runtime command-event lifecycle** — every state change follows `Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection`.
- **Golden Image guardrails** — validation scripts fail if these invariants disappear.

## Planes behind the interface

| Plane | Product meaning | Current maturity |
| --- | --- | --- |
| Control Plane | command routing, policy decisions, API projections | live |
| Agent Runtime | job queue, run lifecycle, tool calls, retries | mock |
| Human Office / Messenger | channels, threads, approvals, human collaboration | mock |
| Connector Hub | integration manifests and scoped capability grants | live |
| Data & Policy | event store, knowledge graph, audit, human gates | live |
| Desktop Launcher | install/start/stop/update/local permission lifecycle | planned |

## UX rule

The UI may add more sheets, rooms, channels, or runtime providers, but it must not regress to a 2D dashboard-first product. The office is the frontstage; dashboard controls are backstage overlays.

## Verification

Run:

```bash
npm run check:golden
npm run check:arch
npm run check
npm run build
```
