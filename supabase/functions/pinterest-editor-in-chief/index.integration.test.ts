// Integration tests for the deployed Pinterest Editor-in-Chief HTTP handler.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/pinterest-editor-in-chief`;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  };
}

Deno.test("editor: CORS preflight succeeds", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://getpawsy.pet",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type, apikey",
    },
  });
  await res.text();
  assert(res.status >= 200 && res.status < 300, `OPTIONS ${res.status}`);
  assert(res.headers.get("access-control-allow-origin"));
});

Deno.test("editor: dry-run POST returns 200 JSON (regression-guards #hook-column bug)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dryRun: true, limit: 5, maxIterations: 0 }),
  });
  const json = await res.json();
  // NOTE: This test currently surfaces a real production bug:
  //   "column pinterest_pin_queue.hook does not exist" → 500.
  // It is intentionally strict so the test fails until the editor query is fixed.
  assertEquals(res.status, 200, `editor returned ${res.status}: ${JSON.stringify(json)}`);
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
  assert(typeof json.ok === "boolean", "missing ok");
  if (json.ok) {
    const hasSummary = "decisions" in json || "summary" in json || "processed" in json;
    assert(hasSummary, "missing decisions/summary/processed");
  }
});

Deno.test("editor: error responses still carry CORS + JSON shape", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dryRun: true, limit: 1, maxIterations: 0 }),
  });
  const json = await res.json();
  // Whether 200 or 5xx, the function MUST return JSON + CORS headers.
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
  assert(res.headers.get("access-control-allow-origin"), "CORS header missing");
  assert(typeof json.ok === "boolean", "ok flag missing");
  if (!json.ok) {
    assert(typeof json.error === "string", "error field missing on failure");
    assert(typeof json.traceId === "string", "traceId missing on failure");
  }
});