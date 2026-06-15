#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const requestedEnvFile = process.env.BINDERY_ENV_FILE ?? ".env.local-stack";
const envFile = path.isAbsolute(requestedEnvFile) ? requestedEnvFile : path.join(root, requestedEnvFile);
const outputFile = path.join(root, ".bindery", "smoke-status.json");
const maxAttempts = Number(process.env.BINDERY_SMOKE_ATTEMPTS ?? 30);
const delayMs = Number(process.env.BINDERY_SMOKE_DELAY_MS ?? 2000);

function envValue(key, fallback = "") {
  if (!fs.existsSync(envFile)) return fallback;
  const env = fs.readFileSync(envFile, "utf8");
  return env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() || fallback;
}

function redact(value) {
  if (!value) return "";
  return value.length <= 4 ? "***" : `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers.entries()), body };
}

async function retry(name, fn) {
  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn();
      if (result.ok) return { name, ok: true, attempt, ...result };
      last = result;
    } catch (error) {
      last = { ok: false, error: error.message };
    }
    await sleep(delayMs);
  }
  return { name, ok: false, attempts: maxAttempts, last };
}

function writeStatus(status) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(status, null, 2));
}

const missionControl = envValue("BINDERY_PUBLIC_URL", "http://localhost:3000").replace(/\/$/, "");
const humanOffice = envValue("BINDERY_PUBLIC_OFFICE_URL", "http://localhost:8065").replace(/\/$/, "");
const ownerEmail = envValue("BINDERY_OWNER_EMAIL", "owner@bindery.local");
const ownerPassword = envValue("BINDERY_OWNER_PASSWORD", "bindery-local-admin");
const skipMattermost = process.env.BINDERY_SMOKE_SKIP_MATTERMOST === "1";

const checks = [];

checks.push(await retry("mission-control health", async () => {
  const out = await fetchJson(`${missionControl}/api/health`);
  return { ok: out.ok && out.body?.ok === true, status: out.status, body: out.body };
}));

checks.push(await retry("setup status", async () => {
  const out = await fetchJson(`${missionControl}/api/setup/status`);
  return { ok: out.ok && out.body?.ready === true && out.body?.firstWorkItem?.id === "task_first_work_order", status: out.status, body: out.body };
}));

if (skipMattermost) {
  checks.push({ name: "mattermost ping", ok: true, skipped: true, reason: "BINDERY_SMOKE_SKIP_MATTERMOST=1" });
} else {
  checks.push(await retry("mattermost ping", async () => {
    const out = await fetchJson(`${humanOffice}/api/v4/system/ping`);
    return { ok: out.ok, status: out.status, body: out.body };
  }));
}

const login = await retry("owner login", async () => {
  const out = await fetchJson(`${missionControl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
  });
  return { ok: out.ok && out.body?.ok === true, status: out.status, cookie: out.headers["set-cookie"] ?? "", body: { ok: out.body?.ok, user: out.body?.user } };
});
checks.push({ ...login, cookie: login.cookie ? redact(login.cookie) : "" });

const cookie = login.cookie ?? "";
if (login.ok && cookie) {
  checks.push(await retry("session me", async () => {
    const out = await fetchJson(`${missionControl}/api/auth/me`, { headers: { cookie } });
    return { ok: out.ok && out.body?.user?.role === "owner", status: out.status, body: out.body };
  }));
}

checks.push(await retry("first work item run", async () => {
  const out = await fetchJson(`${missionControl}/api/tasks/task_first_work_order/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ requestedBy: "setup-smoke" }),
  });
  return { ok: out.ok && out.body?.ok === true, status: out.status, body: { ok: out.body?.ok, decision: out.body?.decision, runId: out.body?.run?.id } };
}));

const status = {
  generatedAt: new Date().toISOString(),
  ready: checks.every((check) => check.ok),
  links: {
    missionControl,
    humanOffice,
    setupStatus: `${missionControl}/api/setup/status`,
    firstWorkItem: `${missionControl}/?focus=task_first_work_order`,
  },
  checks,
};
writeStatus(status);

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}${check.status ? ` (${check.status})` : ""}`);
}
console.log(`\nsmoke status written: ${path.relative(root, outputFile)}`);
console.log(JSON.stringify({ ready: status.ready, links: status.links }, null, 2));
if (!status.ready) process.exit(1);
