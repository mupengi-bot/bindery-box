// @bindery-box/data-store
// The Data Plane boundary. Wraps canonical state plus the append-only event
// log behind a small store interface so the runtime never touches files
// directly. Local MVP uses JSON-on-disk; appliance/hosted can swap the impl.
import * as fs from "node:fs/promises";
import * as path from "node:path";

// In-memory store, useful for tests/validation and as the base behaviour.
export function createMemoryStore(initialState) {
  let state = initialState ?? null;
  return {
    async load() {
      return state;
    },
    async save(next) {
      state = next;
      return state;
    },
    // Append-only: events are never mutated or removed in place.
    async appendEvents(events) {
      if (!state) throw new Error("store has no state to append events to");
      state.events = state.events ?? [];
      state.events.push(...events);
      return state.events;
    },
    async getEvents() {
      return state?.events ?? [];
    }
  };
}

// JSON-file backed store. seedFactory is invoked when no file exists yet.
export function createFileStore(filePath, seedFactory) {
  const resolved = path.resolve(filePath);
  return {
    async load() {
      try {
        return JSON.parse(await fs.readFile(resolved, "utf8"));
      } catch {
        const seeded = typeof seedFactory === "function" ? seedFactory() : null;
        if (seeded) await this.save(seeded);
        return seeded;
      }
    },
    async save(next) {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, JSON.stringify(next, null, 2));
      return next;
    },
    async appendEvents(events) {
      const state = await this.load();
      state.events = state.events ?? [];
      state.events.push(...events);
      await this.save(state);
      return state.events;
    },
    async getEvents() {
      const state = await this.load();
      return state?.events ?? [];
    }
  };
}
