// @bindery-box/office-mattermost
// Office Plane adapter (MOCK). Consumes runtime events and records the office
// posts that *would* be sent to Mattermost. No network, no real token — this
// proves the event -> office projection contract for the public alpha.
// (docs/architecture/runtime-events.md "Office Sync Shape".)
import { makeId, nowIso } from "../../domain/src/index.mjs";

// Maps a runtime event to a channel + human-facing message, or null to skip.
export function projectEvent(event) {
  switch (event.type) {
    case "task.created":
      return { channel: "#tasks", kind: "task_created", text: `새 업무 생성: ${event.title ?? event.taskId}` };
    case "task.run.started":
      return { channel: "#tasks", kind: "task_thread", text: `업무 실행 시작: ${event.taskTitle ?? event.taskId}` };
    case "task.run.completed":
      return { channel: "#tasks", kind: "task_result", text: `업무 완료: ${event.resultSummary ?? event.taskId}` };
    case "task.run.failed":
      return { channel: "#tasks", kind: "task_failed", text: `업무 실패: ${event.error ?? event.taskId}` };
    case "agent.run.queued":
      return { channel: "#tasks", kind: "agent_run_queued", text: `실행 큐 등록: ${event.goal ?? event.taskId}` };
    case "agent.run.started":
      return { channel: "#tasks", kind: "agent_run_started", text: `에이전트 실행 시작: ${event.taskId}` };
    case "agent.stream.delta":
      return { channel: "#ops-control", kind: "agent_stream", text: `진행: ${event.delta ?? event.taskId}` };
    case "agent.run.completed":
      return { channel: "#tasks", kind: "agent_run_completed", text: `에이전트 실행 완료: ${event.resultSummary ?? event.taskId}` };
    case "agent.run.cancelled":
      return { channel: "#ops-control", kind: "agent_run_cancelled", text: `에이전트 실행 취소: ${event.reason ?? event.orchestratorRunId}` };
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

export function createMattermostOfficeAdapter({ baseUrl, token, teamRef = "team_platform", channelMap = {} } = {}) {
  if (!baseUrl || !token) throw new Error("Mattermost adapter requires BINDERY_MATTERMOST_URL and BINDERY_MATTERMOST_TOKEN");
  const posts = [];

  async function postToMattermost(projection, event) {
    const channelId = channelMap[projection.channel] ?? projection.channelId;
    if (!channelId) {
      throw new Error(`Mattermost channel mapping missing for ${projection.channel}`);
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v4/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel_id: channelId, message: projection.text }),
    });
    if (!res.ok) throw new Error(`Mattermost post failed: ${res.status}`);
    const body = await res.json();
    return {
      id: makeId("office"),
      provider: "mattermost",
      teamRef,
      channelRef: projection.channel,
      channelId,
      providerPostId: body.id,
      kind: projection.kind,
      text: projection.text,
      sourceEventId: event.id ?? null,
      sourceEventType: event.type,
      postedAt: nowIso()
    };
  }

  async function handleEvent(event) {
    const projection = projectEvent(event);
    if (!projection) return null;
    const post = await postToMattermost(projection, event);
    posts.push(post);
    return post;
  }

  async function handleEvents(events) {
    const out = [];
    for (const event of events) {
      const post = await handleEvent(event);
      if (post) out.push(post);
    }
    return out;
  }

  return {
    provider: "mattermost",
    teamRef,
    handleEvent,
    handleEvents,
    getPosts: () => posts.slice()
  };
}
