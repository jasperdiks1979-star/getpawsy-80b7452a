// Integration tests for the deployed pre-publish gate HTTP handler.
// Validates CORS preflight, JSON response shape, status codes, and auth gateway
// behavior. Runs against the live function — requires VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY in the project .env.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/pinterest-native-prepublish-gate`;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  };
}

Deno.test("CORS preflight returns 2xx with permissive headers", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://getpawsy.pet",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type, apikey",
    },
  });
  await res.text();
  assert(res.status >= 200 && res.status < 300, `OPTIONS status ${res.status}`);
  const allowOrigin = res.headers.get("access-control-allow-origin");
  assert(allowOrigin === "*" || allowOrigin === "https://getpawsy.pet",
    `unexpected allow-origin: ${allowOrigin}`);
});

Deno.test("dry-run POST returns 200 with expected JSON shape", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dryRun: true, sampleSize: 50 }),
  });
  const json = await res.json();
  assertEquals(res.status, 200, `unexpected status: ${res.status}`);
  assertEquals(typeof json, "object");
  assert(typeof json.ok === "boolean", "missing ok");
  if (json.ok) {
    assert("traceId" in json, "missing traceId");
    assert("nativeScore" in json || "summary" in json || "decisions" in json,
      "missing score/summary/decisions key");
  }
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
});

Deno.test("POST without apikey is rejected by Supabase gateway", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  });
  await res.text();
  // Supabase function gateway returns 401 for unauthenticated requests
  assert(res.status === 401 || res.status === 403,
    `expected 401/403, got ${res.status}`);
});

Deno.test("invalid JSON body still returns JSON (defaults applied)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: "not-json",
  });
  const json = await res.json();
  assert(res.status === 200 || res.status === 500, `status ${res.status}`);
  assert(typeof json.ok === "boolean");
});