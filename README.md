# BINDERY BOX / MUFI Box

**AI Company-in-a-Box** — Mattermost Office + Mission Control Web + Local Agent Runtime + Desktop Launcher로 구현하는 온프레미스 멀티에이전트 회사 운영 플랫폼.

> 작은 회사 하나를 고객사 내부망에 설치한다.

## Product Frame

BINDERY BOX는 고객사 내부에 작은 AI 운영팀을 설치하는 공식 서비스입니다. 에이전트는 Mattermost 안에서 직원처럼 일하고, Mission Control에서 조직도·업무·승인·감사·KPI를 관제하며, Local Runtime이 실제 파일/도구/커넥터 실행을 담당합니다.

## Core Modules

1. **Mattermost Office** — AI 직원이 보이는 회사 사무실
2. **Mission Control Web** — 조직도, 업무 큐, 승인, 로그, KPI 대시보드
3. **Agent Runtime** — 역할별 에이전트, 도구 실행, 스케줄러, 지식 검색
4. **Connector Hub** — GitHub, 파일, 이메일, ERP/MES, CSV, Webhook, MCP 연결
5. **Knowledge Graph** — 문서, 고객, 프로젝트, 결정, 이슈, 탄소 데이터 관계망
6. **Desktop Launcher** — 로컬 실행, 업데이트, 포트 점검, 권한/시크릿 관리

## Initial Vertical

**Manufacturing Edition**

- Production Leader: 생산일보, 납기 위험, 비가동 원인 요약
- Sales Leader: 견적 초안, 고객 follow-up, 수주 가능성 분석
- Scope 3 Leader: 공급망 탄소 데이터 수집, 누락 관리, 보고 초안

## Development Plan

- Latest HTML masterplan: [`docs/bindery-box-development-masterplan.html`](docs/bindery-box-development-masterplan.html)
- Legacy plan link: [`docs/bindery-box-development-plan.html`](docs/bindery-box-development-plan.html)

## Platform Architecture

The current Alpha is a runnable prototype, not the final platform architecture. Before major feature work, BINDERY BOX is being split into explicit Control Plane, Runtime Plane, Office Plane, Connector Hub, Data Plane, Policy/Governance, and Desktop/Appliance boundaries.

- Architecture overview: [`docs/architecture.md`](docs/architecture.md)
- Platform-first architecture: [`docs/architecture/platform-first-architecture.md`](docs/architecture/platform-first-architecture.md)
- Canonical domain model: [`docs/architecture/domain-model.md`](docs/architecture/domain-model.md)
- Runtime commands/events: [`docs/architecture/runtime-events.md`](docs/architecture/runtime-events.md)

## Repository Status

This repository is the official product architecture and implementation home. The runnable Alpha slice exists to validate product shape; platform contracts and boundaries take priority before broad feature expansion.

## Security Note

Public repository artifacts must contain templates and demo data only. Do not commit real profiles, tokens, sessions, logs, customer files, private memory, or machine-specific runtime paths.

## Alpha Development Slice

BINDERY BOX now includes a first runnable local MVP slice:

- `apps/web` — Mission Control "Control Room": a 3-pane workspace (agent org · operations board · approval/knowledge/office inspector) with a live operations log that streams runtime, agent, audit, and office activity (`GET /api/workspaces/:id/live-log`, auto-refreshed every 2.5s).
- `apps/api` — local HTTP API on port `4311`.
- `packages/core` — shared product/domain model.
- `packages/runtime` — demo task execution, approval, and audit lifecycle.
- `apps/desktop` — desktop launcher preview for the future installable app.
- `examples/manufacturing-demo` — production, sales, and Scope 3 demo data.

### Quick start

```bash
npm run check
npm run seed
npm run dev:api
# in another terminal
npm run dev:web
```

Open `http://localhost:4310`. The API runs on `http://localhost:4311`.
