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
  const root = process.cwd();
  const source = "/Users/mupeng/.openclaw/workspace/memory/ops/photobooth-ops-autopilot-2026-05-27.md";
  const opsDir = path.join(root, "fixtures", "photobooth-ops-workspace");
  await fs.mkdir(path.join(opsDir, "inbox"), { recursive: true });
  await fs.mkdir(path.join(opsDir, "bindery-output"), { recursive: true });
  const sourceText = await fs.readFile(source, "utf8");
  await fs.writeFile(path.join(opsDir, "inbox", "photobooth-ops-autopilot.md"), sourceText.slice(0, 5000), "utf8");
  await fs.writeFile(path.join(opsDir, "inbox", "today-request.md"), "포토부스 운영 병목을 정리하고 이번 주 P0 액션 3개를 산출해줘.\n", "utf8");

  const grant = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/local-device/scopes",
    body: { path: opsDir, label: "Photobooth Ops Workspace", mode: "read-write", requestedBy: "photobooth-e2e" }
  });
  check("grant photobooth ops folder", grant.status === 200 && grant.body.scope?.label === "Photobooth Ops Workspace" && !JSON.stringify(grant.body).includes("/Users/"));

  const files = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/files", searchParams: new URLSearchParams({ path: "inbox" }) });
  check("list photobooth inbox files", files.status === 200 && files.body.entries?.some((entry) => entry.name === "photobooth-ops-autopilot.md"));

  const preview = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/preview", searchParams: new URLSearchParams({ path: "inbox/photobooth-ops-autopilot.md" }) });
  check("preview photobooth ops source", preview.status === 200 && preview.body.file?.content?.includes("포토부스 운영 오토파일럿"));

  const writeContent = [
    "# BINDERY 포토부스 운영 액션 초안",
    "",
    "## P0 액션 3개",
    "1. 행사 D-3/D-1/D-day/D+1 체크리스트 자동 푸시를 먼저 연결한다.",
    "2. 라우터/용지/우드부스 용지 재고 임계치 알림을 daily queue에 올린다.",
    "3. 과거 종료일인데 열린 ERP events를 Human Gate 승인 대상으로 묶는다.",
    "",
    "외부 발송·ERP 상태 변경·구매/발주는 Human Gate 승인 전에는 실행하지 않는다.",
    ""
  ].join("\n");
  const writeRequest = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/local-device/files/write",
    body: { path: "bindery-output/photobooth-weekly-actions.md", content: writeContent, requestedBy: "photobooth-e2e" }
  });
  check("request photobooth output write approval", writeRequest.status === 200 && writeRequest.body.approval?.status === "pending");

  const writeDecision = await handleRequest({ method: "POST", pathname: `/api/approvals/${writeRequest.body.approval.id}/decision`, body: { decision: "approved", decidedBy: "photobooth-e2e" } });
  check("approve photobooth output write", writeDecision.status === 200 && writeDecision.body.result?.localDeviceResult?.kind === "file.write");

  const outputPreview = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/local-device/preview", searchParams: new URLSearchParams({ path: "bindery-output/photobooth-weekly-actions.md" }) });
  check("preview generated photobooth output", outputPreview.status === 200 && outputPreview.body.file?.content?.includes("P0 액션 3개"));

  const terminalRequest = await handleRequest({ method: "POST", pathname: "/api/workspaces/default/local-device/terminal/run", body: { command: "ls bindery-output", requestedBy: "photobooth-e2e" } });
  check("request terminal verification approval", terminalRequest.status === 200 && terminalRequest.body.approval?.status === "pending");
  const terminalDecision = await handleRequest({ method: "POST", pathname: `/api/approvals/${terminalRequest.body.approval.id}/decision`, body: { decision: "approved", decidedBy: "photobooth-e2e" } });
  check("terminal verifies generated output", terminalDecision.status === 200 && terminalDecision.body.result?.localDeviceResult?.stdout?.includes("photobooth-weekly-actions.md"));

  const task = await handleRequest({
    method: "POST",
    pathname: "/api/workspaces/default/tasks",
    body: {
      title: "포토부스 운영 폴더를 읽고 이번 주 액션 3개를 정리",
      lane: "operations",
      expectedOutput: "포토부스 운영 P0 액션 파일 + 승인 로그",
      execute: true,
      requestedBy: "photobooth-e2e"
    }
  });
  check("create and execute photobooth operations task", task.status === 200 && task.body.ok === true && task.body.result?.planExecution?.artifact?.visibleInOffice === true);

  const log = await handleRequest({ method: "GET", pathname: "/api/workspaces/default/live-log" });
  const logJson = JSON.stringify(log.body);
  check("live log records photobooth local-device work", log.status === 200 && logJson.includes("local_device") && logJson.includes("포토부스"));

  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error("validate-photobooth-local-e2e failed:", error);
  process.exit(1);
});
