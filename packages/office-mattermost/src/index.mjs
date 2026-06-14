// @bindery-box/office-mattermost
// Office Plane adapter (MOCK). Consumes runtime events and records the office
// posts that *would* be sent to Mattermost. No network, no real token — this
// proves the event -> office projection contract for the public alpha.
// (docs/architecture/runtime-events.md "Office Sync Shape".)
import { makeId, nowIso } from "../../domain/src/index.mjs";

// Maps a runtime event to a channel + human-facing message, or null to skip.
function projectEvent(event) {
  switch (event.type) {
    case "task.created":
      return { channel: "#tasks", kind: "task_created", text: `새 업무 생성: ${event.title ?? event.taskId}` };
    case "task.run.started":
      return { channel: "#tasks", kind: "task_thread", text: `업무 실행 시작: ${event.taskTitle ?? event.taskId}` };
    case "task.run.completed":
      return { channel: "#tasks", kind: "task_result", text: `업무 완료: ${event.resultSummary ?? event.taskId}` };
    case "task.run.failed":
      return { channel: "#tasks", kind: "task_failed", text: `업무 실패: ${event.error ?? event.taskId}` };
    case "approval.requested":
      return { channel: "#approvals", kind: "approval_post", text: `승인 요청: ${event.reason ?? event.approvalId} (Mission Control에서 결정)` };
    case "approval.decided":
      return { channel: "#approvals", kind: "approval_decision", text: `승인 결정(${event.decision}): ${event.approvalId}` };
    default:
      return null;
  }
}

export function createMockOfficeAdapter(options = {}) {
  const teamRef = options.teamRef ?? "team_platform";
  const posts = [];

  function handleEvent(event) {
    const projection = projectEvent(event);
    if (!projection) return null;
    const post = {
      id: makeId("office"),
      provider: "mattermost-mock",
      teamRef,
      channelRef: projection.channel,
      kind: projection.kind,
      text: projection.text,
      sourceEventId: event.id ?? null,
      sourceEventType: event.type,
      postedAt: nowIso()
    };
    posts.push(post);
    return post;
  }

  // Consume a batch of events, returning only the office posts produced.
  function handleEvents(events) {
    return events.map(handleEvent).filter(Boolean);
  }

  return {
    provider: "mattermost-mock",
    teamRef,
    handleEvent,
    handleEvents,
    getPosts: () => posts.slice()
  };
}
