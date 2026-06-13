// RTS office interaction guardrails.
import * as fs from "node:fs/promises";

const checks = [];
let failures = 0;
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures += 1;
}
async function read(path) { return fs.readFile(path, "utf8"); }

const exp = await read("src/features/office/OfficeExperience.tsx");
const scene = await read("src/features/office/scene/OfficeScene.tsx");
const composer = await read("src/features/office/hud/GoalComposer.tsx");
const panel = await read("src/features/office/hud/AgentPanel.tsx");
const contracts = await read("packages/contracts/src/index.mjs");
const runtime = await read("packages/runtime/src/index.mjs");
const doc = await read("docs/architecture/rts-office-interaction.md");

check("fixed RTS camera declared", exp.includes("RTS_CAMERA") && !exp.includes("OrbitControls"));
check("selected agent move targets", exp.includes("moveTargets") && scene.includes("MoveTargetMarker"));
check("floor click movement", scene.includes("onMoveSelected") && scene.includes("issueMove(e.point"));
check("zone work request station", scene.includes("WorkRequestStation") && scene.includes("＋ 업무 요청"));
check("Goal Composer lane focus", composer.includes("initialLane") && composer.includes("직원 생성"));
check("agent card shows role prompt", panel.includes("ROLE PROMPT") && panel.includes("agent.prompt"));
check("agent.create command contract", contracts.includes("agent.create") && contracts.includes("agent.created"));
check("runtime creates safe agents", runtime.includes("handleAgentCreate") && runtime.includes("capabilityGrants: []"));
check("RTS doc covers move command", doc.includes("agent.move.requested") && doc.includes("Fixed camera first"));

for (const r of checks) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
console.log(`
${checks.length - failures}/${checks.length} RTS checks passed.`);
if (failures) process.exit(1);
