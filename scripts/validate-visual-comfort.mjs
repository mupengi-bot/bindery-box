// Visual comfort guardrails for the 3D AI office.
import * as fs from "node:fs/promises";

const checks = [];
let failures = 0;
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) failures += 1;
}
async function read(path) { return fs.readFile(path, "utf8"); }

const css = await read("src/app/globals.css");
const exp = await read("src/features/office/OfficeExperience.tsx");
const scene = await read("src/features/office/scene/OfficeScene.tsx");
const config = await read("src/features/office/scene/sceneConfig.ts");
const desk = await read("src/features/office/scene/Desk.tsx");
const firstRun = await read("src/features/office/hud/FirstRunOverlay.tsx");
const doc = await read("docs/architecture/rts-office-interaction.md");

check("comfort is default CSS theme", css.includes('[data-bx-theme="comfort"]') && css.includes("--bx-bg: #f5f2ea") && css.includes("color-scheme: light"));
check("night theme preserved as explicit mode", css.includes('[data-bx-theme="night"]') && exp.includes('setVisualThemeId((t) => (t === "comfort" ? "night" : "comfort"))'));
check("font stack includes product-safe Korean/Latin faces", css.includes("Pretendard") && css.includes("Inter") && css.includes("Noto Sans KR"));
check("scene visual themes are tokenized", config.includes("OFFICE_VISUAL_THEMES") && config.includes('comfort: {') && config.includes('night: {'));
check("comfort palette avoids near-black canvas/floor", config.includes('canvas: "#f5f2ea"') && config.includes('floor: "#e8e1d4"'));
check("Canvas uses visual theme tokens", exp.includes("visualTheme.canvas") && exp.includes("visualTheme.fog") && scene.includes("visualTheme.floor"));
check("HUD root receives theme attribute", exp.includes("data-bx-theme={visualThemeId}"));
check("Night Ops toggle is visible", exp.includes("Night Ops") && exp.includes("Comfort"));
check("office furniture uses visual theme tokens", desk.includes("visualTheme?.desk") && scene.includes("visualTheme.shelf") && scene.includes("visualTheme.deskTop"));
check("first-run overlay is daylight, not dark-only", firstRun.includes("rgba(245,242,234") && firstRun.includes("var(--bx-text)") && !firstRun.includes("rgba(3,6,14,0.94)"));
check("RTS doc includes comfort interaction plan", doc.includes("Character and 3D interaction upgrade plan") && doc.includes("Penguin silhouette layer"));
check("3D office defaults to stability-first lite mode", exp.includes('useState<RenderMode>("lite")') && exp.includes('[0.7, 0.9]') && exp.includes('powerPreference: "default"'));
check("WebGL context loss is surfaced to operator", exp.includes("webglcontextlost") && exp.includes("webglWarning") && exp.includes("저사양 모드"));
check("hot path React position updates are throttled", exp.includes("lastPositionReportAt") && exp.includes("now - prevReportAt < 180") && scene.includes("lastHoverUpdateAt") && scene.includes("now - lastHoverUpdateAt.current < 80"));

for (const r of checks) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
console.log(`\n${checks.length - failures}/${checks.length} visual comfort checks passed.`);
if (failures) process.exit(1);
