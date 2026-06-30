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

Deno.test("editor: dry-run POST returns 200 JSON with summary fields", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dryRun: true, limit: 5, maxIterations: 0 }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
  assert(typeof json.ok === "boolean", "missing ok");
  if (json.ok) {
    const hasSummary = "decisions" in json || "summary" in json || "processed" in json;
    assert(hasSummary, "missing decisions/summary/processed");
  }
});

Deno.test("editor: missing apikey rejected by gateway", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun: true, limit: 1 }),
  });
  await res.text();
  assert(res.status === 401 || res.status === 403, `status ${res.status}`);
});