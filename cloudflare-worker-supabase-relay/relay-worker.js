/**
 * getpawsy.pet — Same-Origin Supabase Edge Function Relay
 *
 * Purpose
 *   Eliminate the failing authenticated cross-origin POST from getpawsy.pet →
 *   *.supabase.co on iPhone Safari. This worker exposes a same-origin path
 *   under `/api/edge/<function-name>` that server-side relays the request to
 *   the Supabase Edge Function while preserving the caller's Bearer JWT.
 *
 * Deploy
 *   Route:  getpawsy.pet/api/edge/*   (and www.getpawsy.pet/api/edge/*)
 *   Runtime: Cloudflare Workers (module syntax, no bindings required)
 *
 * Security invariants
 *   1. NEVER attaches a service-role key. The relay is a pure JWT pass-through.
 *   2. The Authorization header MUST be present and start with "Bearer ".
 *      Otherwise → 401 (no upstream call is made).
 *   3. Only an allowlist of edge functions is proxied. Everything else → 404.
 *   4. The upstream response body/status/headers are returned verbatim
 *      (minus hop-by-hop headers).
 *   5. Same-origin, so no CORS preflight is triggered from the browser.
 */

const SUPABASE_HOST = "nojvgfbcjgipjxpfatmm.supabase.co";
// Supabase publishable (anon) key — safe to ship in a browser bundle; used
// only to satisfy the `apikey` header the Functions gateway requires.
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

// Explicit allowlist. Add functions here as the admin surfaces need them.
const ALLOWED_FUNCTIONS = new Set([
  "merchant-api-probe",
  "merchant-api-shadow",
]);

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // Never leak upstream CORS onto the same-origin response.
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
]);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Path shape: /api/edge/<function-name>
    const match = url.pathname.match(/^\/api\/edge\/([a-zA-Z0-9_-]+)\/?$/);
    if (!match) return jsonResponse(404, { ok: false, error: "not_found" });

    const fnName = match[1];
    if (!ALLOWED_FUNCTIONS.has(fnName)) {
      return jsonResponse(404, { ok: false, error: "function_not_allowed", fn: fnName });
    }

    // Same-origin: no CORS preflight is expected. Reject just in case.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST" && request.method !== "GET") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed" });
    }

    const auth = request.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return jsonResponse(401, { ok: false, error: "missing_auth" });
    }

    const upstreamUrl = `https://${SUPABASE_HOST}/functions/v1/${fnName}`;
    const upstreamHeaders = new Headers();
    upstreamHeaders.set("authorization", auth);           // pass-through JWT
    upstreamHeaders.set("apikey", SUPABASE_ANON_KEY);     // gateway requirement
    const ct = request.headers.get("content-type");
    if (ct) upstreamHeaders.set("content-type", ct);
    // Forensic correlation header, safe to expose.
    upstreamHeaders.set("x-relay", "getpawsy-supabase-relay/1");

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: request.method === "GET" ? undefined : request.body,
      });
    } catch (e) {
      return jsonResponse(502, {
        ok: false,
        error: "relay_upstream_fetch_failed",
        message: e && e.message ? e.message : String(e),
      });
    }

    // Copy through, minus hop-by-hop and CORS headers.
    const outHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      outHeaders.set(k, v);
    }
    outHeaders.set("x-relay-upstream-status", String(upstream.status));
    outHeaders.set("cache-control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: outHeaders,
    });
  },
};