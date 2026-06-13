import { spawn } from "node:child_process";
const commands = [
  ["api", "node", ["apps/api/server.mjs"]],
  ["web", "node", ["apps/web/server.mjs"]]
];
const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${name}] ${chunk}`));
  return child;
});
process.on("SIGINT", () => { for (const child of children) child.kill("SIGINT"); process.exit(0); });
