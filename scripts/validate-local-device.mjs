#!/usr/bin/env node
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { handleRequest } from "../src/server/controlPlane.mjs";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) failures += 1;
}

async function main() {
  const fixtureDir = path.join(process.cwd(), "fixtures", "demo-workspace");
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(path.join(fixtureDir, "ops-note.md"), "# Ops Note\n\nLocal desktop file preview works.\n");

  const health = await handleRequest({ method: "GET", pathname: "/api/health" });
  check("health advertises desktop-local-workbench", health.status === 200 && health.body.surface === "desktop-local-workbench", health.body.surface);

  const device = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device" });
  check("GET local-device → manifest", device.status === 200 && device.body.manifest?.mode === "desktop-local-device");
  check("local-device default surface is desktop workbench", device.body.manifest?.defaultSurface === "desktop-workbench");
  check("local-device runtime is this computer", device.body.manifest?.runtime?.host === "local-device" && device.body.manifest?.runtime?.runLocation === "this-computer");
  check("policy keeps data local by default", device.body.policy?.defaults?.dataLeavesDevice === false);
  check("policy requires approval for external sends", device.body.policy?.defaults?.externalSendRequiresApproval === true);
  check("policy hides raw secrets", device.body.policy?.defaults?.rawSecretsVisibleToUi === false);
  check("policy hides raw local paths in logs", device.body.policy?.defaults?.rawLocalPathsInPublicLogs === false);
  check("workspace-files scope exists", device.body.policy?.scopes?.some((scope) => scope.id === "workspace-files"));

  const grant = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/local-device/scopes",
    body: { path: `${process.cwd()}/fixtures/demo-workspace`, label: "Demo workspace", mode: "read-only", requestedBy: "ci" }
  });
  check("POST local-device scope → redacted scope", grant.status === 200 && grant.body.ok === true && grant.body.scope?.pathLabel && !grant.body.scope.rawPath && !String(grant.body.scope.pathLabel).includes("/Users/"), JSON.stringify(grant.body.scope));

  const invalidGrant = await handleRequest({ method: "POST", pathname: "/api/workspaces/default/local-device/scopes", body: { path: "", label: "Broken", mode: "read-write", requestedBy: "ci" } });
  check("invalid folder grant returns JSON 400 not blank 500", invalidGrant.status === 400 && invalidGrant.body.ok === false && String(invalidGrant.body.error).includes("workspace scope path"));

  const afterGrant = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device" });
  check("GET local-device after scope → configured", afterGrant.body.scopes?.some((scope) => scope.label === "Demo workspace" && scope.mode === "read-only"));

  const writeGrant = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/local-device/scopes",
    body: { path: fixtureDir, label: "Writable demo workspace", mode: "read-write", requestedBy: "ci" }
  });
  check("POST local-device read-write scope → configured", writeGrant.status === 200 && writeGrant.body.scope?.mode === "read-write");

  const files = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/files" });
  check("GET local-device/files → directory listing", files.status === 200 && files.body.entries?.some((entry) => entry.name === "ops-note.md"), JSON.stringify(files.body.entries?.[0]));
  check("file listing redacts raw local path", files.status === 200 && !JSON.stringify(files.body).includes("/Users/"));

  const previewFile = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/preview", searchParams: new URLSearchParams({ path: "ops-note.md" }) });
  check("GET local-device/preview → text preview", previewFile.status === 200 && previewFile.body.file?.content?.includes("Local desktop file preview works"));
  check("file preview redacts raw local path", previewFile.status === 200 && !JSON.stringify(previewFile.body.file).includes("/Users/"));

  const writeRequest = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/local-device/files/write",
    body: { path: "bindery-output/validated.md", content: "validated local write", requestedBy: "ci" }
  });
  check("POST local-device/files/write → approval packet", writeRequest.status === 200 && writeRequest.body.approval?.status === "pending" && !JSON.stringify(writeRequest.body).includes("validated local write"));
  const writeDecision = await handleRequest({ method: "POST", pathname: `/api/approvals/${writeRequest.body.approval.id}/decision`, body: { decision: "approved", decidedBy: "ci" } });
  check("approve file write → local file applied", writeDecision.status === 200 && writeDecision.body.result?.localDeviceResult?.kind === "file.write");
  const writtenPreview = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/preview", searchParams: new URLSearchParams({ path: "bindery-output/validated.md" }) });
  check("approved file write can be previewed", writtenPreview.status === 200 && writtenPreview.body.file?.content === "validated local write");

  const terminalRequest = await handleRequest({ method: "POST", pathname: "/api/workspaces/default/local-device/terminal/run", body: { command: "pwd", requestedBy: "ci" } });
  check("POST local-device/terminal/run → approval packet", terminalRequest.status === 200 && terminalRequest.body.approval?.localDeviceAction?.type === "terminal.run");
  const terminalDecision = await handleRequest({ method: "POST", pathname: `/api/approvals/${terminalRequest.body.approval.id}/decision`, body: { decision: "approved", decidedBy: "ci" } });
  check("approve terminal run → command output captured", terminalDecision.status === 200 && terminalDecision.body.result?.localDeviceResult?.kind === "terminal.run" && terminalDecision.body.result.localDeviceResult.stdout);

  const browserRequest = await handleRequest({ method: "POST", pathname: "/api/workspaces/default/local-device/browser/open", body: { url: "http://localhost:3000", requestedBy: "ci" } });
  check("POST local-device/browser/open → approval packet", browserRequest.status === 200 && browserRequest.body.approval?.localDeviceAction?.type === "browser.open");

  const missingTaskRun = await handleRequest({ method: "POST", pathname: "/api/tasks/not_real/run", body: { requestedBy: "ci" } });
  check("missing task run returns JSON 404 not blank 500", missingTaskRun.status === 404 && missingTaskRun.body.ok === false && String(missingTaskRun.body.error).includes("Task not found"));
  const missingApprovalDecision = await handleRequest({ method: "POST", pathname: "/api/approvals/not_real/decision", body: { decision: "approved", decidedBy: "ci" } });
  check("missing approval decision returns JSON 404 not blank 500", missingApprovalDecision.status === 404 && missingApprovalDecision.body.ok === false && String(missingApprovalDecision.body.error).includes("Approval not found"));

  const diagnostics = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/diagnostics" });
  check("GET diagnostics → internal console projection", diagnostics.status === 200 && diagnostics.body.ok === true && diagnostics.body.features?.some((item) => item.id === "plan-preview") && diagnostics.body.skillStatus?.length);
  check("diagnostics exposes live counters", diagnostics.status === 200 && diagnostics.body.counters?.workspaceScopes >= 1 && diagnostics.body.runtime?.memoryMb?.rss >= 0);

  const artifacts = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/artifacts" });
  const firstArtifactId = artifacts.body.artifacts?.[0]?.id;
  const artifactPreview = await handleRequest({ method: "GET", pathname: `/api/workspaces/default/artifacts/${firstArtifactId}/preview` });
  check("GET artifact preview → preview packet", artifactPreview.status === 200 && artifactPreview.body.preview?.title);

  const officeViewDoc = await import("node:fs/promises").then((fs) => fs.readFile("src/app/office/page.tsx", "utf8"));
  check("3D office demoted to /office route", officeViewDoc.includes("OfficeExperience"));
  const desktopPage = await import("node:fs/promises").then((fs) => fs.readFile("src/app/page.tsx", "utf8"));
  check("root page loads DesktopWorkbench", desktopPage.includes("DesktopWorkbench"));

  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error("validate-local-device failed:", error);
  process.exit(1);
});
