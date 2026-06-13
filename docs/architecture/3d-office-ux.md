# BINDERY BOX 3D Office UX Notes

BINDERY BOX uses a **Visualization Layer** on top of the agent runtime: the user starts from a simple goal composer, while the system shows agent work as a spatial office simulation.

## Reference patterns reviewed

- **Claw3D** — strong fit for a 3D virtual office metaphor: agents as workers, rooms as operational lanes, visual status cues, and an office/studio layer above an agent gateway.
- **three.ws** — useful idea: give agents a visible body/avatar. For BINDERY BOX this becomes lightweight agent pods/desks instead of full character rendering.
- **ai-agent-session-center** — useful operational pattern: animated agent sessions, live terminal/log history, and queuing. BINDERY BOX keeps this as backstage/debug rather than the first screen.
- **Claw Control** — useful mission-control concepts: kanban, live agent feed, real-time sync, mobile-first agent management.
- **Emdash** — useful orchestration pattern: multiple agents/worktrees shown as parallel work sessions.

## Product decision

The BINDERY BOX home should not expose all dashboards at once. The main surface is:

1. **Goal Composer** — “오늘 어떤 일을 맡길까요?”
2. **3D Office Stage** — pseudo-3D rooms, agent pods, mission paths, approval beacon.
3. **Next Flow** — selected goal → mission → agent → approval → result.

Heavy detail remains behind layers:

- 성과: Agent Performance Market
- 공정: pipeline, approvals, mission board, workstream
- 조직: topology, lanes, roster, knowledge graph
- Debug: raw live log

## Implementation boundary

Current implementation uses CSS/SVG pseudo-3D only. No external rendering engine, CDN, or third-party source code is copied. A future desktop/appliance edition can replace the pseudo-3D stage with a real rendering layer while keeping the same runtime/workstream APIs.
