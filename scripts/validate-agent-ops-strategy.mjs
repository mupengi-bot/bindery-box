// Agent Ops Strategy contract checks.
//
// Guards the product rule that BINDERY BOX uses operations strategy to make
// staffing, placement, governance and progress understandable — not to create
// childish point systems or individual pressure loops.
import * as fs from "node:fs/promises";
import { createMemoryStore } from "../packages/data-store/src/index.mjs";
import { seedDemoState } from "../packages/runtime/src/index.mjs";
import { handleRequest } from "../src/server/controlPlane.mjs";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
}
async function read(path) { return fs.readFile(path, "utf8"); }

async function main() {
  const store = createMemoryStore(seedDemoState());
  const res = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/workstream", store });
  const strategy = res.body.agentOpsStrategy;

  check("workstream exposes agentOpsStrategy", res.status === 200 && !!strategy);
  check("strategy has staffing health for every lane", strategy?.laneHealth?.length === 4);
  check("strategy recommends at least one hire/placement", strategy?.recommendedHires?.length > 0, `${strategy?.recommendedHires?.length ?? 0} recommendations`);
  check("recommended hire includes first mission + governance note",
    strategy?.recommendedHires?.every((h) => h.lane && h.role && h.firstMission && h.governanceNote && Array.isArray(h.capabilities)));
  check("operating milestones are meaningful progress, not raw points",
    strategy?.operatingMilestones?.every((m) => m.label && m.meaning && m.unlocks && typeof m.done === "number" && typeof m.total === "number"));
  check("strategy principle rejects point competition",
    /포인트|의미 있는 진전|권한 통제/.test(strategy?.principle ?? ""));

  const types = await read("src/features/office/types.ts");
  check("types declare AgentOpsStrategy", types.includes("interface AgentOpsStrategy") && types.includes("RecommendedHire") && types.includes("OperatingMilestone"));

  const runtime = await read("packages/runtime/src/index.mjs");
  check("runtime derives lane staffing playbook", runtime.includes("LANE_STAFFING_PLAYBOOK") && runtime.includes("agentOpsStrategy"));
  check("runtime avoids childish pressure-loop language", !/streak|leaderboard|\bXP\b|coin/i.test(runtime));

  const board = await read("src/features/office/hud/PerformanceBoard.tsx");
  check("PerformanceBoard surfaces Ops Strategy", board.includes("OPS STRATEGY") && board.includes("strategy.headline") && board.includes("operatingMilestones"));

  const composer = await read("src/features/office/hud/GoalComposer.tsx");
  check("GoalComposer surfaces recommended placement", composer.includes("RECOMMENDED PLACEMENT") && composer.includes("recommendedHire.firstMission") && composer.includes("governanceNote"));

  const docs = await read("docs/architecture/3d-office-ux.md");
  const docsLower = docs.toLowerCase();
  check("3D UX docs describe current R3F/Three office", docs.includes("React Three Fiber") && docsLower.includes("operations strategy"));

  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failures}/${results.length} agent ops strategy checks passed.`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error("validate-agent-ops-strategy failed:", e);
  process.exit(1);
});
