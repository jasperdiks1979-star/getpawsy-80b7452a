// Live read-only tests for merchant-api-probe. No writes.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const URL = `${SUPABASE_URL}/functions/v1/merchant-api-probe`;

function expectCors(r: Response) {
  assert(r.headers.get("access-control-allow-origin"), "missing CORS on " + r.status);
}
function noSensitive(s: string) {
  assert(!/eyJ[A-Za-z0-9_\-]+\./.test(s), "JWT-like token leaked in body");
  assert(!/service_role/i.test(s), "service_role reference leaked");
  assert(!/\bat .*\.ts:\d+/.test(s), "stack trace leaked");
}

Deno.test("OPTIONS preflight returns 200 with CORS", async () => {
  const r = await fetch(URL, {
    method: "OPTIONS",
    headers: {
      "Origin": "https://getpawsy.pet",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,apikey,content-type,x-client-probe-id",
    },
  });
  await r.text();
  assertEquals(r.status, 200);
  expectCors(r);
});

Deno.test("GET without Authorization returns 401 missing_auth with CORS", async () => {
  const r = await fetch(URL, { method: "GET", headers: { "Origin": "https://getpawsy.pet" } });
  const body = await r.text();
  assertEquals(r.status, 401);
  expectCors(r);
  assert(body.includes("missing_auth"));
  noSensitive(body);
});

Deno.test("POST with apikey but no Authorization returns 401 missing_auth with CORS", async () => {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Origin": "https://getpawsy.pet", "apikey": ANON ?? "", "content-type": "application/json" },
    body: "{}",
  });
  const body = await r.text();
  assertEquals(r.status, 401);
  expectCors(r);
  assert(body.includes("missing_auth"));
  noSensitive(body);
});

Deno.test("POST with malformed Bearer returns JSON 401 with CORS (no bare 500)", async () => {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Origin": "https://getpawsy.pet",
      "apikey": ANON ?? "",
      "Authorization": "Bearer not-a-real-jwt",
      "content-type": "application/json",
      "x-client-probe-id": "test-malformed",
    },
    body: "{}",
  });
  const body = await r.text();
  expectCors(r);
  assertEquals(r.status, 401);
  const parsed = JSON.parse(body);
  assertEquals(parsed.ok, false);
  assertEquals(parsed.error, "invalid_auth");
  noSensitive(body);
});

Deno.test("POST with empty Bearer returns 401 invalid_auth", async () => {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Origin": "https://getpawsy.pet",
      "apikey": ANON ?? "",
      "Authorization": "Bearer ",
      "content-type": "application/json",
    },
    body: "{}",
  });
  const body = await r.text();
  expectCors(r);
  assertEquals(r.status, 401);
  assert(body.includes("invalid_auth"));
  noSensitive(body);
});

Deno.test("probeId is echoed on invalid_auth response", async () => {
  const probeId = "test-probe-" + crypto.randomUUID();
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Origin": "https://getpawsy.pet",
      "apikey": ANON ?? "",
      "Authorization": "Bearer not-a-real-jwt",
      "content-type": "application/json",
      "x-client-probe-id": probeId,
    },
    body: "{}",
  });
  const body = await r.text();
  assertEquals(r.status, 401);
  assertEquals(r.headers.get("x-echo-probe-id"), probeId);
  const parsed = JSON.parse(body);
  assertEquals(parsed.probeId, probeId);
  noSensitive(body);
});

Deno.test("expired-looking JWT returns 401 invalid_auth (no 500, no leak)", async () => {
  // Structurally-valid JWT (header.payload.signature) with exp in the past.
  const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", role: "authenticated", exp: 1 }));
  const fake = `${header}.${payload}.invalidsig`;
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "Origin": "https://getpawsy.pet",
      "apikey": ANON ?? "",
      "Authorization": `Bearer ${fake}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const body = await r.text();
  expectCors(r);
  assertEquals(r.status, 401);
  const parsed = JSON.parse(body);
  assertEquals(parsed.ok, false);
  assertEquals(parsed.error, "invalid_auth");
  noSensitive(body);
});