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
const avatar = await read("src/features/office/scene/AgentAvatar.tsx");
const hud = await read("src/features/office/hud/Hud.tsx");
const contracts = await read("packages/contracts/src/index.mjs");
const runtime = await read("packages/runtime/src/index.mjs");
const doc = await read("docs/architecture/rts-office-interaction.md");
const routing = await read("src/features/office/routing.ts");

check("fixed RTS camera declared", exp.includes("RTS_CAMERA") && !exp.includes("OrbitControls"));
check("scroll zoom enabled", exp.includes("MapControls") && exp.includes("enableZoom") && exp.includes("minDistance") && exp.includes("maxDistance"));
check("right-click movement supported", exp.includes("onContextMenu") && scene.includes("onContextMenu") && scene.includes("issueMove(e.point"));
check("selected agent move targets", exp.includes("moveTargets") && scene.includes("MoveTargetMarker"));
check("agent arrival clamps movement", avatar.includes("ARRIVAL_EPSILON") && avatar.includes("setArrived(true)") && !avatar.includes("dir.current = -1"));
check("no autonomous status walking", routing.includes("Physical navigation is operator-commanded only") && routing.includes("const waypoints: Vec2[] = [seat]") && doc.includes("No autonomous walking"));
check("HUD layer contract", hud.includes("HUD_Z") && hud.includes("gridTemplateAreas") && hud.includes("composer") && hud.includes("sheet"));
check("3D HTML stays below HUD", scene.includes("OFFICE_HTML_Z") && avatar.includes("OFFICE_HTML_Z"));
check("Virtual Office rendering reference adopted", scene.includes("leooooii/Virtual-Office") && scene.includes("BakedContactShadows") && scene.includes("OfficeProps") && scene.includes("Plant") && scene.includes("Shelf"));
check("persisted move API wired", exp.includes("data.moveAgent") && runtime.includes("handleAgentMove") && contracts.includes("agent.move.requested"));
check("floor click movement", scene.includes("onMoveSelected") && scene.includes("issueMove(e.point"));
check("zone work request station", scene.includes("WorkRequestStation") && scene.includes("＋ 업무 요청"));
check("zone request creates task", composer.includes("onCreateTask") && composer.includes("업무 생성") && runtime.includes("handleTaskCreate"));
check("Goal Composer lane focus", composer.includes("initialLane") && composer.includes("직원 생성"));
check("role templates visible", composer.includes("roleTemplates") && composer.includes("Prompt Preview"));
check("agent card shows role prompt", panel.includes("ROLE PROMPT") && panel.includes("agent.prompt"));
check("agent.create command contract", contracts.includes("agent.create") && contracts.includes("agent.created"));
check("runtime creates safe agents", runtime.includes("handleAgentCreate") && runtime.includes("capabilityGrants: []"));
check("RTS doc covers move command", doc.includes("agent.move.requested") && doc.includes("Fixed camera first"));

for (const r of checks) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
console.log(`
${checks.length - failures}/${checks.length} RTS checks passed.`);
if (failures) process.exit(1);
