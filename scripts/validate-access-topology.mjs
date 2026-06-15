// Multi-user hardware path guardrails.
// Run with: npm run check:access
import * as fs from "node:fs/promises";
import { handleRequest } from "../src/server/controlPlane.mjs";

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

async function read(path) {
  return fs.readFile(path, "utf8");
}

const doc = await read("docs/architecture/multi-user-hardware-path.md");
for (const phrase of [
  "Human user",
  "HardwareNode",
  "AccessRoute",
  "GET /api/workspaces/:id/access-topology",
  "GET /api/hardware/routes",
  "user.message.ingest",
]) {
  check(`doc mentions ${phrase}`, doc.includes(phrase));
}

const contract = JSON.parse(await read("docs/contracts/multi-user-hardware-contract.json"));
check("contract version", contract.version === "0.1.0", contract.version);
for (const entity of ["HumanUser", "HardwareNode", "AccessRoute", "Workspace"]) {
  check(`contract entity ${entity}`, contract.requiredEntities?.includes(entity));
}
for (const role of ["owner", "operator", "approver", "viewer", "system"]) {
  check(`contract role ${role}`, contract.roles?.includes(role));
}

const topology = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/access-topology" });
check("GET access-topology → users", topology.status === 200 && topology.body.users?.length >= 2);
check("GET access-topology → hardware node", topology.status === 200 && topology.body.hardwareNodes?.some((n) => n.kind === "appliance"));
check("GET access-topology → ready routes", topology.status === 200 && topology.body.summary?.readyRoutes >= 3);
check("access invariant", topology.body.invariant === contract.invariant);

const routes = await handleRequest({ method: "GET", pathname: "/api/hardware/routes" });
check("GET hardware/routes → route metadata", routes.status === 200 && routes.body.routes?.some((r) => r.surface === "human-office"));
check("hardware routes omit raw secrets", !JSON.stringify(routes.body).match(/secret_value|token_value|password|privateKey/i));

let failures = 0;
for (const c of checks) {
  if (!c.ok) failures += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}
console.log(`\n${checks.length - failures}/${checks.length} access checks passed.`);
if (failures) process.exit(1);
