# BINDERY BOX Desktop

**Local AI Operations Desk** — 내 컴퓨터 안에서 일하는 AI 운영팀.

BINDERY BOX is now desktop-first. The primary product is a local workbench that can use explicitly granted local folders, terminal commands, browser sessions, local apps, and optional external connectors under a Human Gate approval model.

```txt
Human goal
  -> Plan Preview
  -> Human Gate for sensitive actions
  -> Local Runtime on this computer
  -> Local artifacts/logs/audit
  -> Optional external connector after approval
```

## Default product surface

- **Desktop Workbench `/`** — goals, tasks, runs, artifacts, approvals, files, connectors, settings.
- **Local Device Plane** — public-safe manifest and access policy for this machine.
- **Office View `/office`** — optional Claw3D-style 3D projection, no longer the first screen.
- **Control Plane / Runtime** — the existing orchestration, live-log, artifact, and approval boundary.

## Local-only invariants

1. Data stays local by default.
2. Folder/app/tool access is explicit and scope-based.
3. External effects require Human Gate approval.
4. Public projections never expose raw secrets or raw machine paths.
5. 3D is a projection view, not the core product dependency.

## API slices

```txt
GET  /api/health
GET  /api/setup/status
POST /api/setup/bootstrap
GET  /api/workspaces/:id/local-device
POST /api/workspaces/:id/local-device/scopes
GET  /api/workspaces/:id/workstream
GET  /api/workspaces/:id/live-log
GET  /api/workspaces/:id/runtime/runs
POST /api/workspaces/:id/plan-preview
POST /api/workspaces/:id/tasks
POST /api/tasks/:id/run
POST /api/approvals/:id/decision
GET  /api/workspaces/:id/artifacts
```

## Architecture contracts

- `docs/architecture/desktop-first-pivot.md`
- `docs/architecture/platform-first-architecture.md`
- `docs/architecture/real-agent-messenger-integration.md`
- `docs/contracts/local-device-contract.json`
- `docs/contracts/agent-messenger-contract.json`

## Development

```bash
npm install
npm run dev
```

Open:

```txt
Desktop Workbench: http://localhost:3000
Office View:       http://localhost:3000/office
```

## Desktop shell / launcher

```bash
npm run bindery:native-start
npm run bindery:desktop
```

`npm run bindery:desktop` opens the active local/LAN workbench. The Electron shell scaffold lives in `apps/desktop/` and adds a safe native folder picker bridge for the web workbench:

```bash
cd apps/desktop
npm install
npm run start
```

Package the unsigned local alpha macOS app/DMG:

```bash
npm run bindery:desktop-package
npm run check:desktop-package
```

Output:

```txt
apps/desktop/dist/mac-arm64/BINDERY BOX Desktop.app
apps/desktop/dist/BINDERY BOX Desktop-0.1.0-alpha.0-arm64.dmg
```

The packaged app expects the local/native BINDERY server to be running. Start it first with `npm run bindery:native-start` or set `BINDERY_DESKTOP_URL` to another reachable workbench URL before launching.

## Verification

```bash
npm run check:local-device
npm run check:desktop-shell
npm run check:desktop-package
npm run check:desktop-live-ui
npm run check:photobooth-local
npm run check
npm run check:work-loop
npm run build
npm audit --omit=dev --audit-level=moderate
```

## Native Mac mini mode

Docker is optional. Native mode runs BINDERY with Node/npm, local Postgres, and launchd.

```bash
npm run bindery:native-setup
npm run bindery:native-start
npm run bindery:native-status
npm run bindery:native-smoke
npm run bindery:native-stop
```

## Legacy/local stack

The previous Docker/Mattermost stack remains available for connector and multi-user experiments, but it is no longer the primary MVP path.

```bash
npm run bindery:setup
npm run bindery:ready
npm run bindery:smoke
npm run bindery:down
```

## Safety

Public artifacts must contain templates and demo data only. Do not commit real profiles, tokens, sessions, logs, customer files, private memory, or machine-specific runtime paths.
