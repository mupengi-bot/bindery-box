# BINDERY BOX Desktop-first Pivot

BINDERY BOX is now a **desktop-first local AI operations desk**.

> 내 컴퓨터 안에서 일하는 AI 운영팀.

## Product contract

The default product is no longer a cloud-first 3D SaaS. The default product is a native/local workbench that runs on the operator's computer and uses explicit grants to access local files, terminal commands, browser sessions, local apps, and optional external connectors.

```txt
Human goal
  -> Plan Preview
  -> Human Gate for sensitive actions
  -> Local Runtime on this computer
  -> Local artifacts/logs/audit
  -> Optional external connector after approval
```

## Non-negotiable invariants

1. **Local by default** — sessions, workspace scopes, artifacts, and logs stay on the device unless an operator enables an external connector.
2. **Permission by scope** — BINDERY may only act on folders/apps/tools explicitly granted through the Local Device Plane.
3. **Human Gate before external effects** — sending messages, uploading files, committing code, submitting browser forms, or changing customer-visible state requires approval.
4. **No secret/path leakage in public projections** — UI/report projections use labels and redacted path display, not raw credentials or machine paths.
5. **3D Office is optional** — the Claw3D office becomes `/office`, a projection view. The primary surface is the Desktop Workbench.

## Primary surfaces

| Surface | Purpose |
| --- | --- |
| Desktop Workbench `/` | Goals, tasks, runs, artifacts, approvals, files, connectors, settings. |
| Local Device Plane `/api/workspaces/:id/local-device` | Manifest and access policy for this machine. |
| Workspace scopes `/api/workspaces/:id/local-device/scopes` | Explicit folder grants, stored locally. |
| Office View `/office` | Optional 3D projection of work state. |
| Runtime/API | Existing Control Plane and Runtime commands. |

## What survives from the previous architecture

- Control Plane router
- Runtime boundary
- Goal → Plan Preview → Execute loop
- Artifact and live-log projections
- Policy/Human Gate semantics
- Optional Human Office connector
- Optional 3D Office projection

## What is demoted

- 3D Office as first screen
- cloud-first SaaS positioning
- Mattermost-first workflow
- Docker/local stack as the primary story
- multi-user hardware appliance as MVP requirement

## MVP target

```txt
Install local app
  -> choose workspace folder
  -> type a business goal
  -> preview plan
  -> execute local read/write work
  -> review artifact
  -> approve or block any external action
```

## Current implementation hooks

- `packages/local-device/src/index.mjs` — local-device manifest, access policy, workspace scope projection.
- `GET /api/workspaces/default/local-device` — public-safe local-device snapshot.
- `POST /api/workspaces/default/local-device/scopes` — register a local workspace scope.
- `GET /api/workspaces/default/local-device/files` — list granted workspace files without leaking raw paths.
- `GET /api/workspaces/default/local-device/preview` — preview a granted workspace file.
- `POST /api/workspaces/default/local-device/files/write` — request Human Gate approval for local file writes.
- `POST /api/workspaces/default/local-device/terminal/run` — request Human Gate approval for terminal commands.
- `POST /api/workspaces/default/local-device/browser/open` — request Human Gate approval for browser open/automation intents.
- `src/features/desktop/DesktopWorkbench.tsx` — desktop-first shell scaffold.
- `/office` — preserved optional 3D office view.
