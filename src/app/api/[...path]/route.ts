// Single catch-all bridge from Next route handlers to the BINDERY BOX control
// plane. Every /api/* request is normalised and delegated to the pure
// `handleRequest` router, preserving the original platform API surface:
//   GET  /api/health
//   GET  /api/workspaces/:ws/overview | workstream | live-log | tasks | approvals | audit-events
//   GET  /api/connectors
//   GET  /api/knowledge/search?q=
//   POST /api/tasks/:id/run
//   POST /api/approvals/:id/decision
//   POST /api/demo/seed
import { handleRequest } from "@/server/controlPlane.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

async function bridge(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      const parsed = await request.json();
      body = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      body = {};
    }
  }
  let out;
  try {
    out = await handleRequest({
      method: request.method,
      pathname: url.pathname,
      searchParams: url.searchParams,
      headers: request.headers,
      body,
    });
  } catch (error) {
    out = {
      status: 500,
      body: {
        ok: false,
        error: error instanceof Error ? error.message : "internal_control_plane_error",
      },
    };
  }
  const responseHeaders = new Headers(JSON_HEADERS);
  for (const [key, value] of Object.entries(out.headers ?? {})) responseHeaders.set(key, String(value));
  return new Response(JSON.stringify(out.body, null, 2), {
    status: out.status,
    headers: responseHeaders,
  });
}

export const GET = bridge;
export const POST = bridge;
export const OPTIONS = bridge;
