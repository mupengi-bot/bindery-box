#!/usr/bin/env node
import * as fs from "node:fs";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) failures += 1;
}
function read(path) { return fs.readFileSync(path, "utf8"); }

const main = read("apps/desktop/src/main.cjs");
const preload = read("apps/desktop/src/preload.cjs");
const pkg = JSON.parse(read("apps/desktop/package.json"));
const workbench = read("src/features/desktop/DesktopWorkbench.tsx");
const hud = read("src/features/office/hud/Hud.tsx");
const rootPkg = JSON.parse(read("package.json"));

check("desktop package names Electron shell", pkg.name === "@bindery-box/desktop-shell");
check("desktop main entry exists", pkg.main === "src/main.cjs" && main.includes("BrowserWindow"));
check("desktop shell loads BINDERY_DESKTOP_URL fallback", main.includes("BINDERY_DESKTOP_URL") && main.includes("http://127.0.0.1:3000"));
check("desktop shell keeps nodeIntegration disabled", main.includes("nodeIntegration: false"));
check("desktop shell keeps contextIsolation enabled", main.includes("contextIsolation: true"));
check("desktop shell exposes folder picker IPC", main.includes("bindery:pick-workspace-folder") && preload.includes("pickWorkspaceFolder"));
check("desktop workbench consumes native folder picker bridge", workbench.includes("window.binderyDesktop") && workbench.includes("Choose folder"));
check("desktop workbench renders file browser", workbench.includes("Workspace files") && workbench.includes("local-device/files"));
check("desktop workbench wires Plan Preview button", workbench.includes("requestPlanPreview") && workbench.includes("/api/workspaces/default/plan-preview") && workbench.includes("onClick={requestPlanPreview}"));
check("desktop workbench avoids private LAN hard-coded defaults", !workbench.includes("192.168."));
check("desktop workbench renders internal console diagnostics", workbench.includes("Internal Console") && workbench.includes("/api/workspaces/default/diagnostics") && workbench.includes("Feature / Skill Status"));
check("desktop workbench renders optimized status and quick actions", workbench.includes("top-status-grid") && workbench.includes("quick-actions") && workbench.includes("Preview plan") && workbench.includes("Open 3D Office"));
check("desktop workbench uses compact diagnostic panels", workbench.includes("compact-panel") && workbench.includes("<details") && workbench.includes("summary><span>Internal Console"));
check("desktop workbench keeps diagnostics visible on smaller screens", workbench.includes("max-width: 1320px") && !workbench.includes(".desktop-rightbar { display: none; }"));
check("desktop workbench auto-grants native picked folders", workbench.includes("desktop-native-picker") && workbench.includes("pickWorkspaceFolder"));
check("desktop workbench renders Human Gate file write", workbench.includes("Local file write through Human Gate") && workbench.includes("local-device/files/write"));
check("desktop workbench renders terminal gate", workbench.includes("Terminal command through Human Gate") && workbench.includes("local-device/terminal/run"));
check("desktop workbench renders browser gate", workbench.includes("Browser automation gate") && workbench.includes("local-device/browser/open"));
check("desktop workbench renders artifact preview", workbench.includes("Artifact Preview") && workbench.includes("firstArtifactId") && workbench.includes("/api/workspaces/default/artifacts/${firstArtifactId}/preview"));
check("desktop workbench renders live operations log", workbench.includes("Live Operations Log") && workbench.includes("live-log"));
check("desktop workbench renders approval actions", workbench.includes("decideApproval") && workbench.includes("Approve") && workbench.includes("Reject"));
check("desktop workbench renders visual projections and graph elements", workbench.includes("LIVE RUN TIMELINE") && workbench.includes("CONNECTOR HEALTH MAP") && workbench.includes("AGENT GRAPH") && workbench.includes("BOTTLENECK CHART") && workbench.includes("visual-projections"));
check("desktop workbench derives projections from live state", workbench.includes("connectorHealth") && workbench.includes("liveTimeline") && workbench.includes("agentGraph") && workbench.includes("bottlenecks") && workbench.includes("workstream?.agents"));
check("desktop workbench keeps projection charts responsive", workbench.includes(".timeline-rail") && workbench.includes(".agent-graph-canvas") && workbench.includes("max-width: 900px") && workbench.includes(".visual-projections"));
check("office HUD guards localStorage exceptions", hud.includes("safeLocalStorageGet") && hud.includes("try {") && !hud.includes("globalThis.localStorage?.getItem(FIRST_RUN_KEY)"));
check("root has bindery:desktop launcher", rootPkg.scripts?.["bindery:desktop"] === "node scripts/bindery-desktop.mjs");

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failures}/${results.length} checks passed.`);
if (failures) process.exit(1);
