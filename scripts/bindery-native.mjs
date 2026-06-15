#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const command = process.argv[2] ?? "status";
const envFile = path.join(root, ".env.native");
const envExample = path.join(root, ".env.native.example");
const binderyDir = path.join(root, ".bindery");
const logsDir = path.join(binderyDir, "logs");
const launchdDir = path.join(os.homedir(), "Library", "LaunchAgents");
const label = "com.bindery.box.native";
const installedPlist = path.join(launchdDir, `${label}.plist`);
const generatedPlist = path.join(binderyDir, "launchd", `${label}.plist`);
const statusFile = path.join(binderyDir, "native-status.json");

function run(bin, args, options = {}) {
  return spawnSync(bin, args, { stdio: "inherit", cwd: root, ...options });
}
function capture(bin, args, options = {}) {
  return spawnSync(bin, args, { stdio: "pipe", encoding: "utf8", cwd: root, ...options });
}
function existsCommand(bin) {
  return capture("/bin/zsh", ["-lc", `command -v ${bin}`]).status === 0;
}
function lanIp() {
  for (const iface of ["en0", "en1"]) {
    const out = capture("ipconfig", ["getifaddr", iface]);
    if (out.status === 0 && out.stdout.trim()) return out.stdout.trim();
  }
  return "localhost";
}
function envValue(key, fallback = "") {
  if (!fs.existsSync(envFile)) return fallback;
  const env = fs.readFileSync(envFile, "utf8");
  return env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() || fallback;
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function postgresBin(name) {
  const candidates = [
    `/opt/homebrew/opt/postgresql@16/bin/${name}`,
    `/usr/local/opt/postgresql@16/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return name;
}
function loadShellCommand(commandText) {
  return `/bin/zsh -lc ${JSON.stringify(commandText)}`;
}

function ensureEnv() {
  if (fs.existsSync(envFile)) return false;
  const ip = lanIp();
  let content = fs.readFileSync(envExample, "utf8");
  content = content.replace("http://localhost:3000", `http://${ip}:3000`);
  content = content.replace("http://localhost:3000", `http://${ip}:3000`);
  content = content.replace("native-local-change-me", `native-${Date.now().toString(36)}-change-me`);
  fs.writeFileSync(envFile, content);
  return true;
}

function ensureDirs() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(path.dirname(generatedPlist), { recursive: true });
}

function ensurePostgres() {
  const brew = existsCommand("brew");
  const pgReady = postgresBin("pg_isready");
  const createdb = postgresBin("createdb");
  const postgresInstalled = fs.existsSync(pgReady) || existsCommand("pg_isready");
  const notes = [];
  if (!brew) notes.push("Homebrew missing: install Homebrew before native Postgres setup.");
  if (!postgresInstalled) {
    notes.push("Postgres missing: run `brew install postgresql@16 && brew services start postgresql@16`.");
    return { ok: false, brew, postgresInstalled, notes };
  }
  run("/bin/zsh", ["-lc", "brew services start postgresql@16 >/dev/null 2>&1 || true"]);
  run(createdb, ["bindery"], { stdio: "ignore" });
  const ready = capture(pgReady, ["-d", "bindery"]);
  return { ok: ready.status === 0, brew, postgresInstalled, notes: ready.status === 0 ? notes : [...notes, "Postgres installed but not ready for database 'bindery'."] };
}

function writePlist() {
  const nodePath = capture("/bin/zsh", ["-lc", "command -v node"]).stdout.trim() || "/usr/bin/env node";
  const npmPath = capture("/bin/zsh", ["-lc", "command -v npm"]).stdout.trim() || "/usr/bin/env npm";
  const startScript = `cd ${JSON.stringify(root)} && set -a && source .env.native && set +a && ${JSON.stringify(npmPath)} run start`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${startScript.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</string>
  </array>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${path.dirname(nodePath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${path.join(logsDir, "native.out.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(logsDir, "native.err.log")}</string>
</dict>
</plist>
`;
  fs.writeFileSync(generatedPlist, plist);
  fs.mkdirSync(launchdDir, { recursive: true });
  fs.copyFileSync(generatedPlist, installedPlist);
}

function launchctl(args, options = {}) {
  return run("launchctl", args, options);
}
function serviceTarget() {
  return `gui/${process.getuid()}/${label}`;
}
function serviceDomain() {
  return `gui/${process.getuid()}`;
}
function serviceStatus() {
  const out = capture("launchctl", ["print", serviceTarget()]);
  return { loaded: out.status === 0, raw: (out.stdout || out.stderr || "").slice(0, 1000) };
}
function links() {
  const publicUrl = envValue("BINDERY_PUBLIC_URL", `http://${lanIp()}:3000`);
  return {
    missionControl: publicUrl,
    setupStatus: `${publicUrl}/api/setup/status`,
    firstWorkItem: `${publicUrl}/?focus=task_first_work_order`,
  };
}
async function writeNativeStatus(extra = {}) {
  const postgres = ensurePostgres();
  const status = {
    generatedAt: new Date().toISOString(),
    mode: "native-mac-mini",
    envFile: path.relative(root, envFile),
    launchdPlist: installedPlist,
    service: serviceStatus(),
    postgres,
    links: links(),
    ...extra,
  };
  writeJson(statusFile, status);
  console.log(`native status written: ${path.relative(root, statusFile)}`);
  console.log(JSON.stringify({ ready: Boolean(postgres.ok), links: status.links, serviceLoaded: status.service.loaded, notes: postgres.notes }, null, 2));
}

async function setup() {
  ensureDirs();
  const createdEnv = ensureEnv();
  const postgres = ensurePostgres();
  writePlist();
  const check = run("npm", ["run", "check:stack"]);
  if (check.status !== 0) process.exit(check.status ?? 1);
  const build = run("npm", ["run", "build"]);
  if (build.status !== 0) process.exit(build.status ?? 1);
  await writeNativeStatus({ createdEnv, setupReady: postgres.ok, blocker: postgres.ok ? null : postgres.notes.join(" ") });
}

async function start() {
  ensureDirs();
  ensureEnv();
  writePlist();
  launchctl(["bootout", serviceDomain(), installedPlist], { stdio: "ignore" });
  const boot = launchctl(["bootstrap", serviceDomain(), installedPlist]);
  if (boot.status !== 0) process.exit(boot.status ?? 1);
  launchctl(["enable", serviceTarget()], { stdio: "ignore" });
  launchctl(["kickstart", "-k", serviceTarget()], { stdio: "ignore" });
  await writeNativeStatus({ started: true });
}

async function stop() {
  launchctl(["bootout", serviceDomain(), installedPlist], { stdio: "ignore" });
  await writeNativeStatus({ stopped: true });
}

async function smoke() {
  const env = { ...process.env, BINDERY_ENV_FILE: envFile, BINDERY_SMOKE_SKIP_MATTERMOST: "1" };
  const result = spawnSync("node", ["scripts/bindery-smoke.mjs"], { stdio: "inherit", cwd: root, env });
  process.exit(result.status ?? 0);
}

if (command === "setup") await setup();
else if (command === "start") await start();
else if (command === "stop") await stop();
else if (command === "status") await writeNativeStatus();
else if (command === "smoke") await smoke();
else {
  console.error("Usage: npm run bindery:native -- <setup|start|stop|status|smoke>");
  process.exit(1);
}
