import * as fs from "node:fs/promises";
import * as path from "node:path";
import { seedDemoState } from "../packages/runtime/src/index.mjs";
const statePath = path.resolve(process.env.BINDERY_STATE_PATH ?? ".bindery/runtime/state.json");
await fs.mkdir(path.dirname(statePath), { recursive: true });
await fs.writeFile(statePath, JSON.stringify(seedDemoState(), null, 2));
console.log(`Seeded ${statePath}`);
