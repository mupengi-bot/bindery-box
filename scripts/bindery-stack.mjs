#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const envFile = path.join(root, ".env.local-stack");
const envExample = path.join(root, ".env.local-stack.example");
const composeFile = path.join(root, "infra", "docker-compose.yml");
const setupStatusFile = path.join(root, ".bindery", "setup-status.json");
const command = process.argv[2] ?? "status";

function run(bin, args, options = {}) {
  return spawnSync(bin, args, { stdio: "inherit", cwd: root, ...options });
}

function docker(args, options = {}) {
  return run("docker", args, options);
}

function envValue(key, fallback = "") {
  if (!fs.existsSync(envFile)) return fallback;
  const env = fs.readFileSync(envFile, "utf8");
  return env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() || fallback;
}

function ensureEnv() {
  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(envExample, envFile);
    console.log(`created ${path.relative(root, envFile)} from example`);
  }
}

function dockerAvailable() {
  return spawnSync("docker", ["--version"], { stdio: "pipe" }).status === 0;
}

function ensureDocker() {
  if (!dockerAvailable()) {
    console.error("Docker is required for the local stack. Install Docker/Colima, then retry.");
    process.exit(1);
  }
}

function composeArgs(args) {
  return ["compose", "--env-file", envFile, "-f", composeFile, ...args];
}

function links() {
  return {
    missionControl: envValue("BINDERY_PUBLIC_URL", "http://localhost:3000"),
    humanOffice: envValue("BINDERY_PUBLIC_OFFICE_URL", "http://localhost:8065"),
    setupStatus: `${envValue("BINDERY_PUBLIC_URL", "http://localhost:3000")}/api/setup/status`,
    firstWorkItem: `${envValue("BINDERY_PUBLIC_URL", "http://localhost:3000")}/?focus=task_first_work_order`,
  };
}

function printLinks() {
  const l = links();
  console.log("");
  console.log("BINDERY BOX local stack");
  console.log(`Mission Control: ${l.missionControl}`);
  console.log(`Human Office:     ${l.humanOffice}`);
  console.log(`Setup Status:     ${l.setupStatus}`);
  console.log(`First Work Item:  ${l.firstWorkItem}`);
  console.log(`Owner email:      ${envValue("BINDERY_OWNER_EMAIL", "owner@bindery.local")}`);
  console.log("Owner password:   stored in .env.local-stack");
}

async function localSetupStatus(extra = {}) {
  const { handleRequest } = await import("../src/server/controlPlane.mjs");
  const out = await handleRequest({ method: "POST", pathname: "/api/setup/bootstrap" });
  return {
    generatedAt: new Date().toISOString(),
    docker: dockerAvailable() ? "available" : "missing",
    envFile: path.relative(root, envFile),
    links: links(),
    setup: out.body,
    ...extra,
  };
}

function writeSetupStatus(status) {
  fs.mkdirSync(path.dirname(setupStatusFile), { recursive: true });
  fs.writeFileSync(setupStatusFile, JSON.stringify(status, null, 2));
  console.log(`setup status written: ${path.relative(root, setupStatusFile)}`);
}

async function setup() {
  ensureEnv();
  const stackCheck = run("npm", ["run", "check:stack"]);
  if (stackCheck.status !== 0) process.exit(stackCheck.status ?? 1);

  const status = await localSetupStatus({
    readyForWork: true,
    nextCommands: dockerAvailable()
      ? ["npm run bindery:up", "open http://localhost:3000", "open http://localhost:8065"]
      : ["Install Docker/Colima", "npm run bindery:up", "open http://localhost:3000"],
    blocker: dockerAvailable() ? null : "Docker/Colima is not installed in this environment, so containers were not started.",
  });
  writeSetupStatus(status);
  printLinks();
  console.log("");
  console.log(JSON.stringify({ readyForWork: status.readyForWork, docker: status.docker, firstWorkItem: status.setup.firstWorkItem, blocker: status.blocker }, null, 2));
}

ensureEnv();

if (command === "setup") {
  await setup();
  process.exit(0);
}

if (command === "ready") {
  await setup();
  ensureDocker();
  const up = docker(composeArgs(["up", "-d"]));
  if (up.status !== 0) process.exit(up.status ?? 1);
  const smoke = run("npm", ["run", "bindery:smoke"]);
  if (smoke.status !== 0) process.exit(smoke.status ?? 1);
  printLinks();
  process.exit(0);
}

if (command === "smoke") {
  const smoke = run("npm", ["run", "bindery:smoke"]);
  process.exit(smoke.status ?? 0);
}

if (command === "init") {
  printLinks();
  process.exit(0);
}

ensureDocker();

if (command === "up") {
  const result = docker(composeArgs(["up", "-d"]));
  if (result.status !== 0) process.exit(result.status ?? 1);
  printLinks();
} else if (command === "down") {
  const result = docker(composeArgs(["down"]));
  if (result.status !== 0) process.exit(result.status ?? 1);
} else if (command === "logs") {
  docker(composeArgs(["logs", "-f", ...process.argv.slice(3)]));
} else if (command === "status") {
  docker(composeArgs(["ps"]));
  printLinks();
} else {
  console.error("Usage: npm run bindery:stack -- <setup|ready|init|up|down|status|logs|smoke>");
  process.exit(1);
}
