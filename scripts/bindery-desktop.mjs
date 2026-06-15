#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const nativeStatus = path.join(root, ".bindery", "native-status.json");

function capture(command) {
  return spawnSync("/bin/zsh", ["-lc", command], { encoding: "utf8", stdio: "pipe", cwd: root });
}

function workbenchUrl() {
  if (process.env.BINDERY_DESKTOP_URL) return process.env.BINDERY_DESKTOP_URL;
  try {
    const parsed = JSON.parse(fs.readFileSync(nativeStatus, "utf8"));
    if (parsed?.links?.missionControl) return parsed.links.missionControl;
  } catch {
    // fall through
  }
  return "http://127.0.0.1:3000";
}

function openUrl(url) {
  if (process.platform === "darwin") return spawnSync("open", [url], { stdio: "inherit" });
  if (process.platform === "win32") return spawnSync("cmd", ["/c", "start", "", url], { stdio: "inherit" });
  return spawnSync("xdg-open", [url], { stdio: "inherit" });
}

const url = workbenchUrl();
const health = capture(`python3 - <<'PY'\nimport urllib.request\ntry:\n  urllib.request.urlopen('${url.replaceAll("'", "")}/api/health', timeout=5)\n  print('ok')\nexcept Exception as e:\n  print(e)\n  raise SystemExit(1)\nPY`);

if (health.status !== 0) {
  console.error(`BINDERY native workbench is not reachable at ${url}. Run npm run bindery:native-start first.`);
  process.exit(1);
}

console.log(`Opening BINDERY BOX Desktop Workbench: ${url}`);
const result = openUrl(url);
process.exit(result.status ?? 0);
