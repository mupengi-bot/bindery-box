# Deploying Mission Control to Vercel (+ optional Supabase)

This guide makes BINDERY BOX Mission Control viewable from outside the dev
machine. The static Mission Control SPA is served by Vercel; a single serverless
function exposes the platform Control Plane API.

> **Secrets policy:** never commit real Vercel/Supabase tokens, keys, or
> personal data. Everything below is configured via the Vercel dashboard env
> vars, not files in the repo. `.env*` is git-ignored.

## What ships

| Piece            | Source                          | Served as                          |
| ---------------- | ------------------------------- | ---------------------------------- |
| Mission Control  | `apps/web/public/*`             | static site (`outputDirectory: public`) |
| Control Plane API | `api/index.mjs`                | serverless function at `/api/*`    |
| Build step       | `scripts/build-web.mjs`         | stages `public/` + injects `config.js` |

The API reuses the existing platform packages unchanged:
`packages/runtime`, `domain`, `contracts`, `data-store`, `policy`,
`connectors`, `knowledge`, `office-mattermost`.

## Runtime modes (no writable filesystem on Vercel)

Serverless functions have no persistent local disk, so `createFileStore` is not
used in the cloud. `api/index.mjs` calls `createCloudStore()`:

- **Stateless demo mode (default).** With no Supabase env vars, an in-memory
  store is seeded from `seedDemoState()`. State lives only for the lifetime of a
  warm function instance and reseeds on cold start. Perfect for a public demo;
  no data is persisted.
- **Hosted mode (optional).** With `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  set, `createSupabaseStore()` persists canonical state as a single JSON row.

`GET /api/health` reports which backend is active:

```json
{ "ok": true, "service": "bindery-api", "runtime": "vercel-serverless",
  "store": { "backend": "memory", "persistent": false, "mode": "stateless-demo" } }
```

## This machine's state (important)

- **No Vercel CLI auth on this machine.** `vercel` is not logged in here. Do the
  deploy from a machine/CI that is authenticated, or run `vercel login` first.
- There may be pre-existing `.vercel` project links lying around. Do **not**
  assume they point at the right project — verify the linked project before
  `vercel deploy`, or remove `.vercel/` and re-link with `vercel link`.
- **Supabase env from other projects exists elsewhere but must NOT be reused.**
  Create a **new** Supabase project and a **new** set of env vars for BINDERY
  BOX. Do not copy another project's `SUPABASE_SERVICE_ROLE_KEY` — the service
  role key bypasses RLS and must be scoped to this project only.

## Deploy (stateless demo — zero secrets)

```bash
# from an authenticated machine
vercel link          # pick/create the BINDERY BOX project
vercel deploy --prod # uses vercel.json: buildCommand + api function
```

`vercel.json` already wires:

- `buildCommand: node scripts/build-web.mjs` → stages `public/`
- `outputDirectory: public`
- `functions["api/index.mjs"]` → the serverless Control Plane
- `rewrites: /api/(.*) -> /api` → all API routes hit the one function

The SPA auto-detects its API base: on a real host it calls the same-origin
`/api`; locally it falls back to `http://localhost:4311`. Override explicitly by
setting the `BINDERY_API_BASE` build env var (baked into `public/config.js`) or
`window.__BINDERY_API_BASE__` at runtime.

## Enable Supabase persistence (optional)

1. Create a **new** Supabase project (do not reuse existing ones).
2. Create the state table:

   ```sql
   create table if not exists public.bindery_state (
     id    text primary key,
     state jsonb not null,
     updated_at timestamptz not null default now()
   );
   -- service-role only; do not expose via anon/public RLS policies.
   alter table public.bindery_state enable row level security;
   ```

3. In the Vercel project, add env vars (Production + Preview):

   - `SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = `<service role key>`
   - `SUPABASE_STATE_TABLE` = `bindery_state` (optional; defaults to this)

4. Add the optional client dependency to the deployment (it is intentionally
   **not** in `package.json`):

   ```bash
   npm i @supabase/supabase-js
   ```

   `createSupabaseStore` imports `@supabase/supabase-js` lazily. If the env vars
   are set but the package is missing, the first request returns a clear error
   instead of crashing the cold start.

5. Redeploy. `GET /api/health` should now report `"backend": "supabase"`.

## Verify

- Function-level (no network, runs in `npm run check`):

  ```bash
  npm run check:cloud
  ```

- After deploy, smoke test the live surface:

  ```bash
  curl https://<deployment>/api/health
  curl https://<deployment>/api/workspaces/default/overview
  curl -X POST https://<deployment>/api/tasks/task_sales_followup/run
  ```
