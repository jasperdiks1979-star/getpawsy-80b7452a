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
  // Documented response shape of the pre-publish gate.
  for (const key of ["actions", "applied", "avgNativeScore", "counts", "drafts", "traceId"]) {
    assert(key in json, `response missing '${key}'`);
  }
  assert(Array.isArray(json.actions), "actions must be array");
  assert(typeof json.avgNativeScore === "number", "avgNativeScore must be number");
  assertEquals(typeof json.counts, "object");
  for (const k of ["downrank", "keep", "reject"]) assert(k in json.counts, `counts.${k} missing`);
  assertEquals(typeof json.applied, "object");
  for (const k of ["downranks", "rejects"]) assert(k in json.applied, `applied.${k} missing`);
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
});

Deno.test("POST without apikey is accepted (verify_jwt disabled)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true, sampleSize: 50 }),
  });
  const json = await res.json();
  // This function is deployed with verify_jwt=false; gateway does not block.
  assertEquals(res.status, 200, `expected 200 for verify_jwt=false, got ${res.status}`);
  assert("actions" in json, "no-auth call must still return shape");
  // CORS must be present on every response, including no-auth.
  assert(res.headers.get("access-control-allow-origin"));
});

Deno.test("invalid JSON body still returns JSON (defaults applied)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: "not-json",
  });
  const json = await res.json();
  // Defaults applied silently → 200 with full shape.
  assertEquals(res.status, 200, `status ${res.status}`);
  assert("actions" in json && "counts" in json);
});