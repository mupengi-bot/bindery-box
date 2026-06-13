// @bindery-box/contracts
// Command/event constructors and lightweight validation helpers.
// See docs/architecture/runtime-events.md for the full command/event catalog.
import { nowIso, makeId } from "../../domain/src/index.mjs";

export const CommandType = Object.freeze({
  taskRun: "task.run",
  taskCreate: "task.create",
  approvalDecide: "approval.decide",
  userMessageIngest: "user.message.ingest",
  agentRunEnqueue: "agent.run.enqueue",
  officeMessagePost: "office.message.post"
});

export const EventType = Object.freeze({
  userMessageReceived: "user.message.received",
  taskRunStarted: "task.run.started",
  taskRunCompleted: "task.run.completed",
  taskRunFailed: "task.run.failed",
  agentRunQueued: "agent.run.queued",
  agentRunStarted: "agent.run.started",
  agentStreamDelta: "agent.stream.delta",
  agentRunCompleted: "agent.run.completed",
  agentRunFailed: "agent.run.failed",
  toolCallRequested: "tool.call.requested",
  toolCallBlocked: "tool.call.blocked",
  toolCallPendingApproval: "tool.call.pending-approval",
  toolCallCompleted: "tool.call.completed",
  approvalRequested: "approval.requested",
  approvalDecided: "approval.decided",
  officeMessagePosted: "office.message.posted",
  auditAppended: "audit.appended"
});

// Minimal field-presence schemas keyed by command type.
const COMMAND_SCHEMAS = {
  [CommandType.taskRun]: ["taskId", "requestedBy"],
  [CommandType.taskCreate]: ["workspaceId", "title", "requestedBy"],
  [CommandType.approvalDecide]: ["approvalId", "decision", "decidedBy"],
  [CommandType.userMessageIngest]: ["workspaceId", "provider", "channelRef", "senderRef", "text", "providerEventId"],
  [CommandType.agentRunEnqueue]: ["workspaceId", "taskId", "agentId", "requestedBy", "goal"],
  [CommandType.officeMessagePost]: ["workspaceId", "channelRef", "text", "correlationId"]
};

export function makeCommand(type, payload = {}) {
  return { type, issuedAt: nowIso(), ...payload };
}

// Returns { ok, errors }. Does not throw, so callers can map to API responses.
export function validateCommand(command) {
  const errors = [];
  if (!command || typeof command !== "object") {
    return { ok: false, errors: ["command must be an object"] };
  }
  const schema = COMMAND_SCHEMAS[command.type];
  if (!schema) {
    return { ok: false, errors: [`unknown command type: ${command.type}`] };
  }
  for (const field of schema) {
    if (command[field] === undefined || command[field] === null || command[field] === "") {
      errors.push(`missing field: ${field}`);
    }
  }
  if (command.type === CommandType.approvalDecide &&
      command.decision && !["approved", "rejected"].includes(command.decision)) {
    errors.push(`invalid decision: ${command.decision}`);
  }
  return { ok: errors.length === 0, errors };
}

export function assertCommand(command) {
  const { ok, errors } = validateCommand(command);
  if (!ok) throw new Error(`Invalid command: ${errors.join("; ")}`);
  return command;
}

// Event constructor. Every event carries a stable id + occurredAt timestamp.
export function makeEvent(type, payload = {}) {
  return { id: makeId("evt"), type, occurredAt: nowIso(), ...payload };
}
