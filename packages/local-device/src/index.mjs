// @bindery-box/local-device
// Local Device Plane. Describes the desktop-first, local-only execution surface
// without granting raw filesystem/browser/terminal access by default.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const LOCAL_ONLY_INVARIANT = "local-device-only: selected folders/apps/tools are accessed on this machine; external effects require Human Gate approval";

export function buildLocalDeviceManifest({ workspaceId = "ws_default", generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    product: "BINDERY BOX Desktop",
    mode: "desktop-local-device",
    workspaceId,
    generatedAt,
    invariant: LOCAL_ONLY_INVARIANT,
    defaultSurface: "desktop-workbench",
    optionalSurfaces: ["office-3d-view", "human-office-connector", "cloud-demo"],
    storage: {
      default: "local",
      canonicalStore: "sqlite-or-local-postgres",
      artifacts: "local-artifact-index",
      cloudSync: "off-by-default"
    },
    runtime: {
      host: "local-device",
      runLocation: "this-computer",
      approvalMode: "human-gate-before-external-effects",
      supportedAccess: ["workspace-files", "terminal", "browser", "local-apps", "connectors"]
    },
    shell: {
      target: "native-desktop-shell",
      primaryViews: ["goals", "tasks", "runs", "artifacts", "approvals", "files", "connectors", "settings"],
      secondaryViews: ["3d-office", "live-log", "knowledge", "agent-roster"]
    }
  };
}

export function buildDeviceAccessPolicy({ workspaceId = "ws_default", scopes = [] } = {}) {
  const platform = process.platform;
  return {
    schemaVersion: 1,
    workspaceId,
    device: {
      platform,
      arch: process.arch,
      homeLabel: platform === "win32" ? "%USERPROFILE%" : "~",
      hostnameLabel: os.hostname() ? "local-device" : "unknown"
    },
    invariant: LOCAL_ONLY_INVARIANT,
    scopes: [
      {
        id: "workspace-files",
        label: "Workspace folders",
        access: "read-write-after-folder-grant",
        status: scopes.length ? "configured" : "needs-folder-grant",
        grants: scopes.map((scope) => ({ id: scope.id, label: scope.label, mode: scope.mode, pathLabel: scope.pathLabel }))
      },
      {
        id: "terminal",
        label: "Terminal commands",
        access: "local-shell",
        status: "available-with-approval",
        guardrail: "dangerous commands and external side effects must pass Human Gate"
      },
      {
        id: "browser",
        label: "Browser automation",
        access: "local-browser-session",
        status: "opt-in",
        guardrail: "login, purchase, post, upload, send, or irreversible actions require approval"
      },
      {
        id: "local-apps",
        label: "Local app automation",
        access: "permission-gated",
        status: "opt-in",
        guardrail: "macOS privacy prompts and app-specific permissions remain user-controlled"
      },
      {
        id: "external-connectors",
        label: "External connectors",
        access: "disabled-by-default",
        status: "requires-credential-and-approval",
        guardrail: "outbound customer/user-facing messages require Human Gate"
      }
    ],
    defaults: {
      dataLeavesDevice: false,
      externalSendRequiresApproval: true,
      rawSecretsVisibleToUi: false,
      rawLocalPathsInPublicLogs: false
    }
  };
}

export function createWorkspaceScope(input = {}) {
  const rawPath = String(input.path ?? "").trim();
  const label = String(input.label ?? "Workspace Folder").trim() || "Workspace Folder";
  const mode = input.mode === "read-only" ? "read-only" : "read-write";
  if (!rawPath) throw new Error("workspace scope path is required");
  if (/\0/.test(rawPath)) throw new Error("workspace scope path contains invalid characters");
  const home = os.homedir();
  const normalized = rawPath.replaceAll("\\", "/");
  const homeNormalized = home.replaceAll("\\", "/");
  const leaf = normalized.split("/").filter(Boolean).at(-1) ?? "workspace";
  const pathLabel = normalized.startsWith(homeNormalized) ? `~${normalized.slice(homeNormalized.length)}` : `[local-folder]/${leaf}`;
  return {
    id: `scope_${Date.now().toString(36)}`,
    label,
    mode,
    pathLabel,
    // Keep the raw path only in local canonical state. Public projections should
    // use pathLabel so reports and screenshots do not leak machine-specific paths.
    rawPath,
    createdAt: new Date().toISOString(),
    status: "active"
  };
}

export function projectWorkspaceScopes(state) {
  return (state.localDevice?.workspaceScopes ?? []).map((scope) => ({
    id: scope.id,
    label: scope.label,
    mode: scope.mode,
    pathLabel: scope.pathLabel,
    status: scope.status,
    createdAt: scope.createdAt
  }));
}

function safeJoinWithinScope(scope, relativePath = "") {
  const root = path.resolve(scope.rawPath);
  const target = path.resolve(root, String(relativePath ?? ""));
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("requested path escapes workspace scope");
  }
  return { root, target };
}

function redactPathForScope(scope, absolutePath) {
  const { root } = safeJoinWithinScope(scope, "");
  const relative = path.relative(root, absolutePath).replaceAll(path.sep, "/");
  return relative ? `${scope.pathLabel}/${relative}` : scope.pathLabel;
}

export async function listWorkspaceFiles(state, { scopeId, relativePath = "", limit = 80 } = {}) {
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === scopeId) ?? scopes[0];
  if (!scope) {
    return { scope: null, pathLabel: null, entries: [], message: "No workspace folder granted yet." };
  }
  const { target } = safeJoinWithinScope(scope, relativePath);
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) throw new Error("requested workspace path is not a directory");
  const dirents = await fs.readdir(target, { withFileTypes: true });
  const entries = [];
  for (const dirent of dirents
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, limit)) {
    const childPath = path.join(target, dirent.name);
    let childStat = null;
    try {
      childStat = await fs.stat(childPath);
    } catch {
      childStat = null;
    }
    entries.push({
      name: dirent.name,
      kind: dirent.isDirectory() ? "directory" : "file",
      size: childStat?.isFile() ? childStat.size : null,
      updatedAt: childStat?.mtime ? childStat.mtime.toISOString() : null,
      pathLabel: redactPathForScope(scope, childPath)
    });
  }
  return {
    scope: { id: scope.id, label: scope.label, mode: scope.mode, pathLabel: scope.pathLabel, status: scope.status },
    pathLabel: redactPathForScope(scope, target),
    entries
  };
}

export async function previewWorkspaceFile(state, { scopeId, relativePath = "", maxBytes = 48_000 } = {}) {
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === scopeId) ?? scopes[0];
  if (!scope) throw new Error("No workspace folder granted yet.");
  const { target } = safeJoinWithinScope(scope, relativePath);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("requested workspace path is not a file");
  const handle = await fs.open(target, "r");
  try {
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return {
      scope: { id: scope.id, label: scope.label, mode: scope.mode, pathLabel: scope.pathLabel, status: scope.status },
      file: {
        name: path.basename(target),
        pathLabel: redactPathForScope(scope, target),
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
        truncated: stat.size > maxBytes,
        content: buffer.toString("utf8")
      }
    };
  } finally {
    await handle.close();
  }
}

export function buildFileWriteApproval(state, { scopeId, relativePath = "", content = "", requestedBy = "desktop-operator" } = {}) {
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === scopeId) ?? scopes[0];
  if (!scope) throw new Error("No workspace folder granted yet.");
  if (scope.mode === "read-only") throw new Error("workspace scope is read-only");
  const { target } = safeJoinWithinScope(scope, relativePath);
  const pathLabel = redactPathForScope(scope, target);
  return {
    id: `approval_${Date.now().toString(36)}`,
    status: "pending",
    workspaceId: state.workspace?.id ?? "ws_default",
    title: `로컬 파일 쓰기 승인: ${path.basename(target)}`,
    reason: "로컬 파일 변경은 Human Gate 승인 후 실행됩니다.",
    summary: `${pathLabel} 파일에 ${String(content).length}자 쓰기 요청`,
    requestedByUserId: requestedBy,
    createdAt: new Date().toISOString(),
    localDeviceAction: {
      type: "file.write",
      scopeId: scope.id,
      relativePath: String(relativePath ?? ""),
      pathLabel,
      content: String(content ?? "")
    }
  };
}

export async function applyApprovedFileWrite(state, approval) {
  const action = approval?.localDeviceAction;
  if (!action || action.type !== "file.write") return null;
  if (approval.status !== "approved") return null;
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === action.scopeId) ?? scopes[0];
  if (!scope) throw new Error("No workspace folder granted yet.");
  if (scope.mode === "read-only") throw new Error("workspace scope is read-only");
  const { target } = safeJoinWithinScope(scope, action.relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, String(action.content ?? ""), "utf8");
  return {
    kind: "file.write",
    pathLabel: redactPathForScope(scope, target),
    bytes: Buffer.byteLength(String(action.content ?? ""), "utf8"),
    appliedAt: new Date().toISOString()
  };
}

function sanitizeShellCommand(command) {
  const text = String(command ?? "").trim();
  if (!text) throw new Error("terminal command is required");
  if (text.length > 500) throw new Error("terminal command is too long");
  return text;
}

export function buildTerminalRunApproval(state, { scopeId, command = "pwd", requestedBy = "desktop-operator" } = {}) {
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === scopeId) ?? scopes[0];
  if (!scope) throw new Error("No workspace folder granted yet.");
  const cleanCommand = sanitizeShellCommand(command);
  return {
    id: `approval_${Date.now().toString(36)}`,
    status: "pending",
    workspaceId: state.workspace?.id ?? "ws_default",
    title: `터미널 실행 승인: ${cleanCommand.slice(0, 80)}`,
    reason: "터미널 명령은 로컬 시스템에 영향을 줄 수 있어 Human Gate 승인 후 실행됩니다.",
    summary: `${scope.pathLabel} 에서 명령 실행 요청`,
    requestedByUserId: requestedBy,
    createdAt: new Date().toISOString(),
    localDeviceAction: { type: "terminal.run", scopeId: scope.id, command: cleanCommand, cwdLabel: scope.pathLabel }
  };
}

export function buildBrowserOpenApproval(state, { url = "", requestedBy = "desktop-operator" } = {}) {
  const parsed = new URL(String(url || ""));
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("browser URL must be http(s)");
  return {
    id: `approval_${Date.now().toString(36)}`,
    status: "pending",
    workspaceId: state.workspace?.id ?? "ws_default",
    title: `브라우저 열기 승인: ${parsed.hostname}`,
    reason: "브라우저 자동화/열기는 로그인·제출·외부 이동으로 이어질 수 있어 Human Gate 승인 후 실행됩니다.",
    summary: `${parsed.href} 열기 요청`,
    requestedByUserId: requestedBy,
    createdAt: new Date().toISOString(),
    localDeviceAction: { type: "browser.open", url: parsed.href, host: parsed.hostname }
  };
}

export function applyApprovedTerminalRun(state, approval) {
  const action = approval?.localDeviceAction;
  if (!action || action.type !== "terminal.run" || approval.status !== "approved") return null;
  const scopes = state.localDevice?.workspaceScopes ?? [];
  const scope = scopes.find((item) => item.id === action.scopeId) ?? scopes[0];
  if (!scope) throw new Error("No workspace folder granted yet.");
  const command = sanitizeShellCommand(action.command);
  const result = spawnSync("/bin/zsh", ["-lc", command], { cwd: path.resolve(scope.rawPath), encoding: "utf8", timeout: 10_000 });
  return {
    kind: "terminal.run",
    command,
    cwdLabel: scope.pathLabel,
    exitCode: result.status ?? 0,
    stdout: String(result.stdout ?? "").slice(0, 4000),
    stderr: String(result.stderr ?? "").slice(0, 4000),
    appliedAt: new Date().toISOString()
  };
}

export function applyApprovedBrowserOpen(approval) {
  const action = approval?.localDeviceAction;
  if (!action || action.type !== "browser.open" || approval.status !== "approved") return null;
  const parsed = new URL(action.url);
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", parsed.href] : [parsed.href];
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
  return {
    kind: "browser.open",
    url: parsed.href,
    host: parsed.hostname,
    exitCode: result.status ?? 0,
    stdout: String(result.stdout ?? "").slice(0, 1000),
    stderr: String(result.stderr ?? "").slice(0, 1000),
    appliedAt: new Date().toISOString()
  };
}
