// Integration tests for the deployed Analytics Truth Engine HTTP handler.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const FN_URL = `${SUPABASE_URL}/functions/v1/analytics-truth-engine`;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  };
}

Deno.test("truth: CORS preflight succeeds", async () => {
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

Deno.test("truth: dry-run POST returns trust snapshot shape", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ hours: 24, dryRun: true }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type")?.split(";")[0], "application/json");
  assertEquals(json.ok, true);
  assert(json.snapshot && typeof json.snapshot === "object", "snapshot object missing");
  for (const key of [
    "window_hours", "trust_score", "human_pct", "bot_pct",
    "pinterest_attribution_pct", "direct_pct", "total_events",
    "total_sessions", "issues", "metric_explanations",
  ]) {
    assert(key in json.snapshot, `snapshot missing '${key}'`);
  }
  assert(Array.isArray(json.snapshot.issues), "issues must be array");
  assert(typeof json.snapshot.trust_score === "number", "trust_score must be number");
  assert(json.snapshot.trust_score >= 0 && json.snapshot.trust_score <= 100,
    "trust_score out of range");
});

Deno.test("truth: GET with query param is accepted", async () => {
  const res = await fetch(`${FN_URL}?hours=12`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ dryRun: true }),
  });
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.snapshot.window_hours, 12);
});

Deno.test("truth: missing apikey is accepted (verify_jwt disabled) and still CORS-tagged", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 1, dryRun: true }),
  });
  const json = await res.json();
  assertEquals(res.status, 200, `expected 200 for verify_jwt=false, got ${res.status}`);
  assertEquals(json.ok, true);
  assert(res.headers.get("access-control-allow-origin"),
    "CORS allow-origin missing on no-auth response");
});