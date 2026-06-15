// Architecture/contract guardrails for the real-agent + messenger integration.
// Run with: npm run check:arch
import * as fs from "node:fs/promises";

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
}

async function read(path) {
  return fs.readFile(path, "utf8");
}

const arch = await read("docs/architecture/real-agent-messenger-integration.md");
check("architecture doc exists", arch.length > 5000, `${arch.length} chars`);
for (const phrase of [
  "Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection",
  "Human Office Plane",
  "3D Office Plane",
  "Runtime Plane",
  "user.message.ingest",
  "agent.run.queued",
  "Human Gate",
]) {
  check(`architecture mentions ${phrase}`, arch.includes(phrase));
}

const contract = JSON.parse(await read("docs/contracts/agent-messenger-contract.json"));
check("contract version", contract.version === "0.1.0", contract.version);
const commandTypes = new Set(contract.commands.map((c) => c.type));
const eventTypes = new Set(contract.events.map((e) => e.type));
for (const type of ["user.message.ingest", "agent.run.enqueue", "agent.run.cancel", "office.message.post"]) {
  check(`contract command ${type}`, commandTypes.has(type));
}
for (const type of ["user.message.received", "agent.run.queued", "agent.run.started", "agent.run.completed", "agent.run.cancelled", "approval.requested"]) {
  check(`contract event ${type}`, eventTypes.has(type));
}
check("messenger adapter methods", contract.adapters?.messengerOfficeAdapter?.inbound?.includes("verifyWebhook"));
check("runtime adapter methods", contract.adapters?.agentRuntimeAdapter?.methods?.includes("enqueue"));

const contractsSrc = await read("packages/contracts/src/index.mjs");
for (const type of ["user.message.ingest", "agent.run.enqueue", "agent.run.cancel", "office.message.post", "agent.run.queued", "agent.run.started", "agent.run.completed", "agent.run.cancelled"]) {
  check(`contracts exports ${type}`, contractsSrc.includes(type));
}

let failures = 0;
for (const c of checks) {
  if (!c.ok) failures += 1;
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}
console.log(`\n${checks.length - failures}/${checks.length} architecture checks passed.`);
if (failures) process.exit(1);
