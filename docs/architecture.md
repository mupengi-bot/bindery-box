# BINDERY BOX Architecture

BINDERY BOX is an AI Company-in-a-Box product. The visual office is Mattermost, the operator surface is Mission Control Web, and the local runtime executes agent tasks with approval and audit boundaries.

## Layers

1. Mission Control Web (`apps/web`) — org chart, task queue, approval center, audit timeline.
2. Local API (`apps/api`) — local HTTP API and state gateway.
3. Runtime (`packages/runtime`) — task execution lifecycle and approval generation.
4. Core (`packages/core`) — shared domain model and demo seed state.
5. Desktop Launcher (`apps/desktop`) — future native launcher for start/stop, logs, permissions, updates.
6. Mattermost Office (`infra/docker-compose.yml`, future connector) — company-like agent workspace.

## First vertical

Manufacturing Edition: Production Leader, Sales Leader, Scope 3 Leader, Ops Controller.
