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

// --- Supabase (hosted Data Plane) -----------------------------------------
//
// Placeholder/interface for a hosted Postgres-backed store. It keeps the
// canonical state as a single JSON row (table `bindery_state`, column
// `state jsonb`) so the runtime contract (load/save/appendEvents/getEvents)
// is unchanged.
//
// IMPORTANT: `@supabase/supabase-js` is an OPTIONAL dependency. It is NOT
// declared in package.json and NOT bundled. The client is imported lazily and
// only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided. Without the
// dependency installed, construction works but the first call throws a clear,
// actionable error instead of crashing the cold start.
//
// See docs/deploy/vercel-supabase.md for provisioning + SQL.
export function createSupabaseStore({ url, serviceRoleKey, table = "bindery_state", rowId = "default", seedFactory } = {}) {
  if (!url || !serviceRoleKey) {
    throw new Error("SupabaseStore requires both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  let clientPromise = null;
  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      let createClient;
      try {
        ({ createClient } = await import("@supabase/supabase-js"));
      } catch {
        throw new Error(
          "SupabaseStore needs the optional '@supabase/supabase-js' dependency. " +
          "Add it to your deployment (npm i @supabase/supabase-js) to enable hosted persistence."
        );
      }
      return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    })();
    return clientPromise;
  }

  async function readRow() {
    const client = await getClient();
    const { data, error } = await client.from(table).select("state").eq("id", rowId).maybeSingle();
    if (error) throw new Error(`SupabaseStore load failed: ${error.message}`);
    return data?.state ?? null;
  }

  async function writeRow(state) {
    const client = await getClient();
    const { error } = await client.from(table).upsert({ id: rowId, state }, { onConflict: "id" });
    if (error) throw new Error(`SupabaseStore save failed: ${error.message}`);
    return state;
  }

  return {
    async load() {
      const existing = await readRow();
      if (existing) return existing;
      const seeded = typeof seedFactory === "function" ? seedFactory() : null;
      if (seeded) await writeRow(seeded);
      return seeded;
    },
    async save(next) {
      return writeRow(next);
    },
    async appendEvents(events) {
      const state = (await readRow()) ?? (typeof seedFactory === "function" ? seedFactory() : {});
      state.events = state.events ?? [];
      state.events.push(...events);
      await writeRow(state);
      return state.events;
    },
    async getEvents() {
      const state = await readRow();
      return state?.events ?? [];
    }
  };
}

// Cloud store selector. Picks the hosted store when Supabase env vars are
// present, otherwise falls back to an in-memory, request/instance-local seeded
// store. The memory fallback is the "stateless demo mode": serverless
// platforms (Vercel) have no writable filesystem, so demo state lives only for
// the lifetime of a warm function instance and reseeds on cold start.
export function createCloudStore({ seedFactory, env = process.env } = {}) {
  if (env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseStore({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      table: env.SUPABASE_STATE_TABLE,
      seedFactory
    });
  }
  return createMemoryStore(typeof seedFactory === "function" ? seedFactory() : null);
}

// Reports which Data Plane backend a given env resolves to (for /health).
export function describeStoreBackend(env = process.env) {
  return env?.SUPABASE_URL && env?.SUPABASE_SERVICE_ROLE_KEY
    ? { backend: "supabase", persistent: true, mode: "hosted" }
    : { backend: "memory", persistent: false, mode: "stateless-demo" };
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
