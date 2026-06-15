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
const firstRun = await read("src/features/office/hud/FirstRunOverlay.tsx");
const performance = await read("src/features/office/hud/PerformanceBoard.tsx");
const planPreviewPanel = await read("src/features/office/hud/PlanPreviewPanel.tsx");

check("fixed RTS camera declared", exp.includes("RTS_CAMERA") && !exp.includes("OrbitControls"));
check("scroll zoom enabled", exp.includes("MapControls") && exp.includes("enableZoom") && exp.includes("minDistance") && exp.includes("maxDistance"));
check("right-click movement supported", exp.includes("onContextMenu") && scene.includes("onContextMenu") && scene.includes("issueMove(e.point"));
check("selected agent move targets", exp.includes("moveTargets") && scene.includes("MoveTargetMarker"));
check("agent arrival clamps movement", avatar.includes("ARRIVAL_EPSILON") && avatar.includes("setArrived(true)") && !avatar.includes("dir.current = -1"));
check("no autonomous status walking", routing.includes("Physical navigation is operator-commanded only") && routing.includes("const waypoints: Vec2[] = [seat]") && !avatar.includes("status === \"running\" || Boolean(route?.moving)") && doc.includes("No autonomous walking"));
check("first-run objective overlay", hud.includes("FIRST_RUN_KEY") && hud.includes("FirstRunOverlay") && firstRun.includes("Start real-work loop") && firstRun.includes("localStorage") === false);
check("next-best-action card", hud.includes("pickNextAction") && hud.includes("NEXT BEST ACTION") && hud.includes("COMMAND HINT"));
check("premium performance board", hud.includes("PerformanceBoard") && performance.includes("AGENT PERFORMANCE") && performance.includes("WATCHLIST") && performance.includes("automationRatio"));
check("plan preview UX", contracts.includes("task.plan.preview") && runtime.includes("buildPlanPreview") && composer.includes("계획 보기") && composer.includes("onPreviewPlan") && composer.includes("inferLaneFromIntent") && planPreviewPanel.includes("PLAN PREVIEW") && planPreviewPanel.includes("expectedArtifacts"));
check("HUD layer contract", hud.includes("HUD_Z") && hud.includes("gridTemplateAreas") && hud.includes("composer") && hud.includes("sheet"));
check("3D HTML stays below HUD", scene.includes("OFFICE_HTML_Z") && avatar.includes("OFFICE_HTML_Z"));
check("Virtual Office rendering reference adopted", scene.includes("leooooii/Virtual-Office") && scene.includes("BakedContactShadows") && scene.includes("OfficeProps") && scene.includes("Plant") && scene.includes("Shelf"));
check("persisted move API wired", exp.includes("data.moveAgent") && runtime.includes("handleAgentMove") && contracts.includes("agent.move.requested"));
check("floor hover movement preview", scene.includes("hoverTarget") && scene.includes("MoveHoverPreview") && scene.includes("crosshair") && scene.includes("우클릭 이동"));
check("left-click floor cancels command mode", scene.includes("clearMoveCommandMode") && scene.includes("onClearSelection") && scene.includes("onClick={(e) => { e.stopPropagation(); clearMoveCommandMode(); }}"));
check("right-click floor movement", scene.includes("onContextMenu={(e) => { e.stopPropagation(); issueMove(e.point); }}") && scene.includes("issueMove(e.point"));
check("station hover taxonomy", scene.includes("좌클릭: 업무 생성") && scene.includes("우클릭: 선택 직원 이동") && scene.includes("document.body.style.cursor = \"alias\""));
check("procedural penguin avatars", avatar.includes("PENGUIN_BODY") && avatar.includes("PENGUIN_BELLY") && avatar.includes("PENGUIN_BEAK") && avatar.includes("PenguinHat") && avatar.includes("hatColorForAgent"));
check("penguin cognition bubble", avatar.includes("CognitionBubble") && avatar.includes("AgentCognition") && scene.includes("cognition={signals?.byAgent.get"));
check("role accessories visible", avatar.includes("RoleAccessory") && avatar.includes("lane === \"engineering\"") && avatar.includes("lane === \"legal\"") && avatar.includes("lane === \"operations\""));
check("arrival feedback pulse", avatar.includes("arrivalPulse") && avatar.includes("arrivalStartedAt") && avatar.includes("wasTravelling") && avatar.includes("route?.moving"));
check("follow selected camera", exp.includes("followSelected") && exp.includes("CameraFollowTarget") && exp.includes("liveAgentPositions") && exp.includes("직원 따라가기"));
check("board camera controls", exp.includes("BOARD_CAMERA_POSITIONS") && exp.includes("CameraBoardView") && exp.includes("시점 회전") && exp.includes("시점 리셋"));
check("arrival hides move marker", exp.includes("arrivedMoveTargets") && exp.includes("markMoveArrived") && scene.includes("onAgentMoveArrived") && scene.includes("physicalHome") && scene.includes("home={physicalHome}") && avatar.includes("onMoveArrived?.(agentId"));
check("zone work request station", scene.includes("WorkRequestStation") && scene.includes("＋ 업무 요청"));
check("zone request creates task", composer.includes("onCreateTask") && composer.includes("업무 생성") && runtime.includes("handleTaskCreate"));
check("Goal Composer lane focus", composer.includes("initialLane") && composer.includes("직원 생성"));
check("role templates visible", composer.includes("roleTemplates") && composer.includes("Prompt Preview"));
check("agent card shows role prompt", panel.includes("ROLE PROMPT") && panel.includes("agent.prompt"));
check("agent.create command contract", contracts.includes("agent.create") && contracts.includes("agent.created"));
check("runtime creates safe agents", runtime.includes("handleAgentCreate") && runtime.includes("capabilityGrants: []"));
check("RTS doc covers move command", doc.includes("agent.move.requested") && doc.includes("Fixed camera first") && doc.includes("Agent cognition projection") && doc.includes("Move markers are ephemeral") && doc.includes("Physical location is not business state"));

for (const r of checks) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
console.log(`
${checks.length - failures}/${checks.length} RTS checks passed.`);
if (failures) process.exit(1);
