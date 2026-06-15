#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

let failures = 0;
const results = [];
function check(name, cond, detail = "") {
  results.push({ name, ok: Boolean(cond), detail });
  if (!cond) failures += 1;
}
function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
}

const desktopDir = path.join(process.cwd(), "apps", "desktop");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
const distDir = path.join(desktopDir, "dist");
const appPath = path.join(distDir, "mac-arm64", "BINDERY BOX Desktop.app");
const plistPath = path.join(appPath, "Contents", "Info.plist");
const executablePath = path.join(appPath, "Contents", "MacOS", "BINDERY BOX Desktop");
const dmgName = `BINDERY BOX Desktop-${pkg.version}-arm64.dmg`;
const dmgPath = path.join(distDir, dmgName);

check("desktop package has electron-builder", Boolean(pkg.devDependencies?.["electron-builder"]));
check("desktop package has package:mac script", pkg.scripts?.["package:mac"]?.includes("electron-builder"));
check("desktop appId is stable", pkg.build?.appId === "box.bindery.desktop");
check("desktop package disables signing for local alpha", pkg.scripts?.["package:mac"]?.includes("identity=null"));
check("packaged .app exists", fs.existsSync(appPath));
check("packaged app executable exists", fs.existsSync(executablePath));
check("packaged DMG exists", fs.existsSync(dmgPath), dmgPath);
if (fs.existsSync(dmgPath)) {
  const size = fs.statSync(dmgPath).size;
  check("packaged DMG is non-empty", size > 50_000_000, `${size} bytes`);
  const verify = run("/usr/bin/hdiutil", ["verify", dmgPath]);
  check("hdiutil verifies packaged DMG", verify.status === 0, (verify.stderr || verify.stdout).slice(0, 300));
}
if (fs.existsSync(plistPath)) {
  const name = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleName", plistPath]);
  const identifier = run("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", plistPath]);
  check("packaged app plist has product name", name.stdout.trim() === "BINDERY BOX Desktop", name.stdout.trim());
  check("packaged app plist has bundle id", identifier.stdout.trim() === "box.bindery.desktop", identifier.stdout.trim());
}

for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failures}/${results.length} checks passed.`);
if (failures) process.exit(1);
