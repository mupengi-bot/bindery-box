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

## Agent Performance Market (Mission Control UX)

Mission Control의 첫 화면은 증권사 홈처럼 단순한 **Agent Performance Market**입니다. 복잡한 런타임·로그는 뒤에 두고(progressive disclosure), 앞에는 "에이전트 실적 시장"만 보여줍니다.

- **상단 검색 중심 내비 + 운영 상태 chip + 실시간 기준 시각** — 시장 상태를 운영 상태(운영 가동 중 / 승인 점검 중 / 인시던트 점검 / 운영 정산 완료 / 운영 대기)로 표현합니다.
- **지수 카드(summary index cards)** — 성과 종합 지수·자동화 지수·처리량 지수·승인 대기를 변화량·변화율·mini sparkline과 함께 표시합니다.
- **Agent Performance Board** — 증권 랭킹 테이블 패턴. 컬럼은 순위 · 에이전트 · 업무 성과 점수(+sparkline) · 변화(상승/하락 색상) · **자동화·사람 split bar** · 처리량 bar · **AI 요약** · 관심(★)/대표 미션 실행입니다. 카테고리(라인)·상태·관심만 **필터 pill**과 검색으로 좁힐 수 있습니다.
- **오른쪽 rail Watchlist** — 관심 에이전트 TOP 10. ★ 토글로 추가/해제합니다.
- **첫 진입 가이드** — "오늘 뭐부터 할까요?" 오버레이에서 목표(라인) 카드를 고르면 해당 라인의 성과 보드로 바로 이동합니다(고급 사용자는 Skip → 전체 보드 + Debug 드로어).
- **금융/투자 표현은 쓰지 않습니다** — 매수/매도가 아닌 '자동화 비율 / 사람 개입', '업무 성과 / 에이전트 실적' 용어만 사용합니다.

데이터는 기존 `GET /api/workspaces/:id/workstream` projection을 확장한 `agentPerformance` / `market`(indices·status·categories) / `watchlist` 필드로 제공됩니다(순수 파생이라 stateless 클라우드 데모에서도 재현 가능). 원시 런타임 로그는 뒤의 **Debug 드로어**(`/live-log`)에 그대로 유지됩니다. 모바일에서는 랭킹 테이블이 카드 리스트로 전환됩니다.

## Alpha Development Slice

BINDERY BOX now includes a first runnable local MVP slice:

- `apps/web` — Mission Control "Agent Performance Market": 증권사 홈 패턴의 front-stage 성과 보드(지수 카드 · 랭킹 테이블 · Watchlist)와 backstage(operations stream · 토폴로지 · 지식 그래프), 그리고 runtime/agent/audit/office 활동을 흘려보내는 Debug live log(`GET /api/workspaces/:id/live-log`, 2.5초 자동 새로고침)로 구성됩니다.
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
