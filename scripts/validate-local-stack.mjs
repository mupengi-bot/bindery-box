// Local stack static contract checks.
// Run with: npm run check:stack
import * as fs from "node:fs/promises";

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}
async function read(path) { return fs.readFile(path, "utf8"); }

const compose = await read("infra/docker-compose.yml");
for (const service of ["postgres", "mattermost", "bindery-web"]) {
  check(`compose service ${service}`, compose.includes(`${service}:`));
}
for (const env of ["BINDERY_DATABASE_URL", "BINDERY_MATTERMOST_DATABASE_URL", "BINDERY_PUBLIC_OFFICE_URL", "BINDERY_SESSION_SECRET"]) {
  check(`compose env ${env}`, compose.includes(env));
}
check("compose exposes Mission Control", compose.includes("${BINDERY_WEB_PORT:-3000}:3000"));
check("compose exposes Mattermost", compose.includes("${BINDERY_MATTERMOST_PORT:-8065}:8065"));
check("compose uses Postgres init", compose.includes("./postgres/init:/docker-entrypoint-initdb.d:ro"));

const initSql = await read("infra/postgres/init/001-databases.sql");
check("postgres init creates bindery db", /CREATE DATABASE bindery/i.test(initSql));
check("postgres init creates mattermost db", /CREATE DATABASE mattermost/i.test(initSql));

const envExample = await read(".env.local-stack.example");
for (const key of ["BINDERY_OWNER_EMAIL", "BINDERY_OWNER_PASSWORD", "BINDERY_MATTERMOST_MODE", "BINDERY_DATABASE_URL"]) {
  check(`env example ${key}`, envExample.includes(`${key}=`));
}
const nativeEnvExample = await read(".env.native.example");
for (const key of ["BINDERY_PUBLIC_URL", "BINDERY_DATABASE_URL", "BINDERY_MATTERMOST_MODE", "BINDERY_OWNER_EMAIL"]) {
  check(`native env example ${key}`, nativeEnvExample.includes(`${key}=`));
}

const dataStore = await read("packages/data-store/src/index.mjs");
check("data-store has Postgres store", dataStore.includes("createPostgresStore") && dataStore.includes("BINDERY_DATABASE_URL"));
check("data-store creates jsonb state table", dataStore.includes("state jsonb NOT NULL"));

const control = await read("src/server/controlPlane.mjs");
for (const route of ["/auth/login", "/auth/logout", "/auth/me", "/setup/status", "/setup/bootstrap", "/hardware/routes", "/access-topology"]) {
  check(`control route ${route}`, control.includes(route));
}

const stackScript = await read("scripts/bindery-stack.mjs");
for (const cmd of ["setup", "ready", "smoke", "init", "up", "down", "status", "logs"]) {
  check(`stack script command ${cmd}`, stackScript.includes(`command === "${cmd}"`));
}
const smokeScript = await read("scripts/bindery-smoke.mjs");
for (const needle of ["/api/health", "/api/setup/status", "/api/auth/login", "/api/tasks/task_first_work_order/run", "/api/v4/system/ping"]) {
  check(`smoke script checks ${needle}`, smokeScript.includes(needle));
}
const nativeScript = await read("scripts/bindery-native.mjs");
for (const needle of ["launchctl", "brew services start postgresql@16", ".env.native", "com.bindery.box.native", "BINDERY_SMOKE_SKIP_MATTERMOST"]) {
  check(`native script supports ${needle}`, nativeScript.includes(needle));
}

const pkg = JSON.parse(await read("package.json"));
check("package script bindery:init", pkg.scripts?.["bindery:init"]?.includes("bindery-stack"));
check("package script bindery:setup", pkg.scripts?.["bindery:setup"]?.includes("bindery-stack"));
check("package script bindery:ready", pkg.scripts?.["bindery:ready"]?.includes("bindery-stack"));
check("package script bindery:smoke", pkg.scripts?.["bindery:smoke"]?.includes("bindery-smoke"));
check("package script bindery:up", pkg.scripts?.["bindery:up"]?.includes("bindery-stack"));
for (const script of ["bindery:native-setup", "bindery:native-start", "bindery:native-stop", "bindery:native-status", "bindery:native-smoke"]) {
  check(`package script ${script}`, pkg.scripts?.[script]?.includes("bindery-native"));
}
check("package depends on pg", Boolean(pkg.dependencies?.pg));

let failures = 0;
for (const c of checks) {
  if (!c.ok) failures += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}
console.log(`\n${checks.length - failures}/${checks.length} local stack checks passed.`);
if (failures) process.exit(1);
