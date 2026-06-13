// Golden Image guardrails: ensures the core identity remains canonical and visible.
import * as fs from "node:fs/promises";
import { getGoldenImage, validateGoldenImageManifest } from "../packages/golden-image/src/index.mjs";
import { handleRequest } from "../src/server/controlPlane.mjs";

let failures = 0;
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures += 1;
}

const manifest = getGoldenImage();
const validation = validateGoldenImageManifest(manifest);
check("manifest self-validates", validation.ok, validation.errors.join("; "));
check("3D office is frontstage", manifest.uxLayers[0]?.id === "frontstage" && manifest.identity.surface === "claw3d-3d-office");
check("messenger is human office", manifest.planes.some((p) => p.id === "human-office"));
check("runtime lifecycle invariant", manifest.lifecycle === "Command -> Policy Check -> Runtime Action -> Event(s) -> Persist -> Projection");
check("Mission Control backstage", manifest.uxLayers.some((l) => l.id === "backstage" && l.name === "Mission Control"));
check("desktop launcher declared", manifest.planes.some((p) => p.id === "desktop-launcher"));

const staticApi = await handleRequest({ method: "GET", pathname: "/api/golden-image" });
check("GET /api/golden-image", staticApi.status === 200 && staticApi.body.codename === "golden-image");
const liveApi = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/golden-image" });
check("GET /api/workspaces/default/golden-image", liveApi.status === 200 && liveApi.body.status?.planesTotal >= 6);

const office = await fs.readFile("src/features/office/OfficeExperience.tsx", "utf8");
const hud = await fs.readFile("src/features/office/hud/Hud.tsx", "utf8");
const sheets = await fs.readFile("src/features/office/hud/Sheets.tsx", "utf8");
check("OfficeExperience renders Canvas before HUD", office.indexOf("<Canvas") >= 0 && office.indexOf("<Canvas") < office.indexOf("<Hud"));
check("Golden Image exposed in HUD/sheets", hud.includes("goldenImage") && sheets.includes("GoldenImageView"));

const snapshot = JSON.parse(await fs.readFile("docs/golden-image/manifest.json", "utf8"));
check("snapshot matches manifest version", snapshot.version === manifest.version);
check("snapshot preserves no-dashboard invariant", snapshot.invariants?.some((i) => i.id === "no-2d-dashboard-first"));

for (const r of checks) {
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
}
console.log(`
${checks.length - failures}/${checks.length} golden-image checks passed.`);
if (failures) process.exit(1);
