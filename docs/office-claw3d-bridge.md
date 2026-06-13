# 3D Agent Office — Claw3D Core Bridge

BINDERY BOX / MUFI Box의 메인 경험은 이제 2D Mission Control이 아니라 **Claw3D-style 3D AI company office**입니다. 사용자는 3D 사무실을 먼저 보고, 목표 입력·승인·성과·로그는 HUD와 secondary sheet로 단계적으로 펼칩니다.

## Current stage — Next.js + React Three Fiber office core

- 진입점: `src/app/page.tsx` → `src/features/office/OfficeExperience.tsx`
- 렌더러: `@react-three/fiber`, `three`, `@react-three/drei`
- 3D scene: `src/features/office/scene/OfficeScene.tsx`
- procedural agent avatars: `src/features/office/scene/AgentAvatar.tsx`
- office geometry / rooms: `src/features/office/scene/sceneConfig.ts`
- route projection: `src/features/office/routing.ts`
- HUD / Mission Control sheets: `src/features/office/hud/*`
- control-plane API: `src/server/controlPlane.mjs`, `src/app/api/[...path]/route.ts`

## Projection contract

3D scene and Mission Control overlays consume the same workstream projection. This is the important invariant: **business state is not duplicated in the renderer**.

| Concept | Source field | Spatial mapping |
| --- | --- | --- |
| Department room | `agents[].lane` | `LANE_ZONES` / `ROOMS` quadrants |
| Workstation | agent roster per lane | deterministic desk + seat layout |
| Agent status | `agents[].status` | avatar accent, halo, movement speed |
| Active mission | `missions[].agentId`, `status`, `requiresApproval` | route destination |
| Running work | agent running + active task | in-room huddle route |
| Human approval | mission waiting approval / requires approval | central meeting room seat |
| Backstage trace | `/live-log` | HUD live process drawer |
| Mission Control | `/workstream`, connectors, knowledge, approvals | secondary sheets, not primary surface |

## Routing semantics

`src/features/office/routing.ts` turns workstream state into an agent route:

1. `desk` — idle, blocked, disabled, or no active mission.
2. `huddle` — active running work inside the department room.
3. `meeting` — mission requires human approval; agent walks via room huddle → room door → meeting table seat.

Routes are renderer-agnostic XZ polylines. The avatar animation samples the polyline by distance, so replacing the procedural scene with imported Claw3D rooms later does not change business logic.

## Upstream attribution

This repository uses `iamlukethedev/Claw3D` as product and architecture inspiration for a 3D virtual office where AI agents are visible as staff members. Imported implementation should preserve upstream MIT attribution and must not copy `.git`, secrets, private profiles, or environment files.

Current implementation is a clean BINDERY BOX layer built with the same public stack family:

- Next.js
- React
- Three.js
- React Three Fiber
- Drei

## Product rule

The 3D office is the **frontstage**. Mission Control, logs, connectors, approvals, and knowledge graph are **backstage / secondary layers**. Do not regress to a 2D dashboard-first product unless explicitly approved.
