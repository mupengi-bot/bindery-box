# 3D Agent Office — Claw3D / Three.js Bridge

Mission Control의 `3D 오피스` 레이어는 워크스트림 데이터를 공간(office scene)으로 투영합니다. 지금은 외부 의존성 없이 **native CSS/SVG 아이소메트릭**으로 빠르게 구현했고, 이후 동일한 투영 계약을 유지한 채 렌더러만 **Claw3D / Three.js 어댑터**로 교체할 수 있도록 설계했습니다.

## 지금 (Stage 1 · native isometric)

- 순수 CSS perspective grid floor + billboarded desk pods (WebGL 없음).
- 진입점: `apps/web/public/index.html`의 `data-lp="office"` 섹션.
- 렌더러: `apps/web/public/app.js`의 `renderOffice(ws)` 및 하위 함수
  (`renderOfficeWall`, `renderOfficeFloor`, `renderOfficeLegend`, `renderOfficePanel`).
- 스타일: `apps/web/public/styles.css`의 `3D Office` 블록 (`--tilt` 변수로 기울기 제어).

## 투영 계약 (renderer-agnostic)

`renderOffice(ws)`가 소비하는 워크스트림 필드 — 어떤 렌더러든 이 입력만 매핑하면 됩니다.

| 개념 | 소스 필드 | 공간 매핑 |
| --- | --- | --- |
| 에이전트 위치 | `ws.agents[].lane` | 레인 → 사무실 존 좌표 (`OFFICE_ZONES`) |
| 상태/에너지/포커스 | `agents[].status / energy / focus / activeMission` | 책상 pod 글로우·에너지 바·말풍선 |
| 회의실 좌석 | `ws.missions[]` 중 `status==="waiting_approval"` | 중앙 회의 테이블 좌석 |
| 파이프라인 월 | `ws.pipeline.stages[]` | 백월 패널 카운트 |
| 라이브 이벤트 버블 | `ws.stream[]` (레인별 최신) | 존 위에 떠다니는 버블 |
| 레인 색상 | lane id | `OFFICE_ZONES[*].color` |
| 선택/상세 | pod click → `openAgentDetail(id)` | 기존 에이전트 드로어 재사용 |

좌표·색상 테이블(`OFFICE_ZONES`, `POD_OFFSETS`)은 `app.js` 상단에 분리되어 있어 3D 좌표계로 그대로 이식할 수 있습니다.

## 다음 (Stage 2 · Claw3D / Three.js adapter)

1. `renderOfficeFloor`를 `OfficeRenderer` 인터페이스 뒤로 추상화: `mount(el)`, `update(projection)`, `onSelect(cb)`, `dispose()`.
2. CSS 구현을 `CssIsometricRenderer`로, 신규 구현을 `Claw3DRenderer`(Three.js scene/camera/glTF desks)로 둠.
3. 위 투영 계약을 Stage 1과 동일하게 유지 → 데이터/이벤트 코드 변경 없이 렌더러만 스왑.
4. 선택·실행·승인 이벤트는 계속 기존 `openAgentDetail` / `runTask` / approval 경로로 위임.

> 외부 라이브러리(Three.js 등)는 Stage 2에서만 도입합니다. Stage 1은 의존성 0으로 제품에 바로 붙는 것을 목표로 합니다.
