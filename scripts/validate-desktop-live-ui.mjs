#!/usr/bin/env node
import * as http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) failures += 1;
}
function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitForTargets(port) {
  for (let i = 0; i < 40; i += 1) {
    try { return await getJson(`http://127.0.0.1:${port}/json`); } catch { await sleep(500); }
  }
  throw new Error(`CDP target not available on ${port}`);
}
async function evaluate(wsUrl, expression, { awaitPromise = false } = {}) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    }
  });
  await new Promise((resolve) => ws.on("open", resolve));
  const send = (method, params = {}) => new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
  ws.close();
  return { result, exceptions };
}

async function main() {
  const start = spawnSync("npm", ["run", "bindery:native-start"], { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" });
  check("native server starts before live UI smoke", start.status === 0, (start.stderr || start.stdout).slice(0, 300));
  if (start.status !== 0) throw new Error("native server failed to start");

  const port = 9344 + Math.floor(Math.random() * 200);
  const proc = spawn("npm", ["--prefix", "apps/desktop", "run", "start", "--", `--remote-debugging-port=${port}`], {
    cwd: process.cwd(),
    env: { ...process.env, BINDERY_DESKTOP_URL: "http://127.0.0.1:3000" },
    detached: true,
    stdio: "ignore"
  });
  try {
    const targets = await waitForTargets(port);
    await sleep(5000);
    const refreshedTargets = await waitForTargets(port);
    const page = refreshedTargets.find((target) => target.type === "page") ?? refreshedTargets[0] ?? targets[0];
    check("Electron page exposes CDP target", Boolean(page?.webSocketDebuggerUrl));
    let result;
    let exceptions = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const evaluated = await evaluate(page.webSocketDebuggerUrl, `(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const before = {
        hasConsole: document.body.innerText.includes('Internal Console'),
        hasSkill: document.body.innerText.includes('Feature / Skill Status'),
        hasQuickActions: document.body.innerText.includes('Preview plan') && document.body.innerText.includes('Open 3D Office'),
        hasStatusGrid: Boolean(document.querySelector('.top-status-grid')),
        hasVisualProjections: document.body.innerText.includes('LIVE RUN TIMELINE') && document.body.innerText.includes('CONNECTOR HEALTH MAP') && document.body.innerText.includes('AGENT GRAPH') && document.body.innerText.includes('BOTTLENECK CHART'),
        timelineSteps: document.querySelectorAll('.timeline-step').length,
        connectorNodes: document.querySelectorAll('.connector-node').length,
        agentNodes: document.querySelectorAll('.agent-node').length,
        bottleneckRows: document.querySelectorAll('.bottleneck-row').length,
        compactPanels: document.querySelectorAll('details.compact-panel').length,
        error: document.querySelector('.error-box')?.textContent || null,
        buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
      };
      const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Plan Preview');
      if (!button) return JSON.stringify({ before, clicked: false, error: 'missing Plan Preview' });
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return JSON.stringify({
        before,
        clicked: true,
        pageFailed: document.body.innerText.includes('This page couldn’t load'),
        hasPreview: Boolean(document.querySelector('.plan-preview-box')),
        preview: document.querySelector('.plan-preview-box')?.textContent || '',
        error: document.querySelector('.error-box')?.textContent || null
      });
    })()`, { awaitPromise: true });
      result = evaluated.result;
      exceptions = evaluated.exceptions;
      if (result?.result?.result?.value) break;
      await sleep(1500);
    }
    const rawValue = result?.result?.result?.value;
    if (typeof rawValue !== "string") {
      check("Plan Preview live evaluation returns serializable result", false, JSON.stringify(result).slice(0, 500));
      for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
      console.log(`\n${results.length - failures}/${results.length} checks passed.`);
      process.exit(1);
    }
    const value = JSON.parse(rawValue);
    check("Desktop renders Internal Console", value.before.hasConsole === true);
    check("Desktop renders Feature / Skill Status", value.before.hasSkill === true);
    check("Desktop renders optimized quick actions", value.before.hasQuickActions === true && value.before.hasStatusGrid === true);
    check("Desktop renders visual projection board", value.before.hasVisualProjections === true);
    check("Desktop renders live timeline steps", value.before.timelineSteps >= 5, String(value.before.timelineSteps));
    check("Desktop renders connector health map", value.before.connectorNodes >= 6, String(value.before.connectorNodes));
    check("Desktop renders agent graph and bottleneck chart", value.before.agentNodes >= 1 && value.before.bottleneckRows >= 4, `${value.before.agentNodes}/${value.before.bottleneckRows}`);
    check("Desktop renders compact diagnostic panels", value.before.compactPanels >= 4, String(value.before.compactPanels));
    check("Plan Preview button exists and clicks", value.clicked === true);
    check("Plan Preview renders without React crash", value.pageFailed === false && value.hasPreview === true, value.preview);
    check("Plan Preview output is human-readable", !String(value.preview).includes("[object Object]") && !String(value.preview).includes("8000%"), value.preview);
    check("Live UI smoke has no runtime exceptions", exceptions.length === 0, exceptions.join("\n"));
  } finally {
    try { process.kill(-proc.pid, "SIGTERM"); } catch { try { proc.kill("SIGTERM"); } catch {} }
  }

  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  console.log(`\n${results.length - failures}/${results.length} checks passed.`);
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error("validate-desktop-live-ui failed:", error);
  process.exit(1);
});
