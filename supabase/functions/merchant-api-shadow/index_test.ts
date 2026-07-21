// Live read-only tests for merchant-api-shadow. No writes.
// Mirrors merchant-api-probe test coverage: OPTIONS CORS, missing/malformed
// auth, probeId echo, and no secret leakage on any error path.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildProductIdSegment } from "../_shared/merchant-api.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
const URL = `${SUPABASE_URL}/functions/v1/merchant-api-shadow`;

function expectCors(r: Response) {
  assert(r.headers.get("access-control-allow-origin"), "missing CORS on " + r.status);
}
function noSensitive(s: string) {
  assert(!/eyJ[A-Za-z0-9_\-]+\./.test(s), "JWT-like token leaked in body");
  assert(!/service_role/i.test(s), "service_role reference leaked");
  assert(!/\bat .*\.ts:\d+/.test(s), "stack trace leaked");
  assert(!/refresh_token|access_token|client_secret/i.test(s), "oauth secret name leaked");
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

Deno.test("POST without Authorization returns 401 missing_auth with CORS", async () => {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Origin": "https://getpawsy.pet", "apikey": ANON ?? "", "content-type": "application/json" },
    body: "{}",
  });
  const body = await r.text();
  assertEquals(r.status, 401);
  expectCors(r);
  const parsed = JSON.parse(body);
  assertEquals(parsed.ok, false);
  assertEquals(parsed.error, "missing_auth");
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
  const probeId = "test-shadow-" + crypto.randomUUID();
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

Deno.test("Structurally-valid but unverifiable JWT returns 401 invalid_auth (no 500, no leak)", async () => {
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

// ─── Offline unit tests: resource-name construction ────────────────────────

Deno.test("buildProductIdSegment produces plain en~US~offerId for safe IDs", () => {
  const offerId = "getpawsy_1a2b3c4d-5e6f-7890-abcd-ef1234567890";
  const seg = buildProductIdSegment("en", "US", offerId);
  assertEquals(seg, `en~US~${offerId}`);
  assert(!/[+/=]/.test(seg), "plain identifier must not be base64url-encoded");
});

Deno.test("buildProductIdSegment falls back to unpadded base64url when component contains reserved chars", () => {
  // Contains '~' inside offerId component → forces base64url encoding.
  const offerId = "getpawsy~weird";
  const seg = buildProductIdSegment("en", "US", offerId);
  assert(!seg.includes("~"), "encoded segment must not contain raw ~");
  assert(!seg.endsWith("="), "base64url must be unpadded");
  assert(!seg.includes("+") && !seg.includes("/"), "must be base64url alphabet");
  // Decode round-trip
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - b64.length % 4) % 4);
  assertEquals(atob(pad), "en~US~getpawsy~weird");
});

Deno.test("buildProductIdSegment encodes when offerId contains '/' or '%'", () => {
  assert(!buildProductIdSegment("en", "US", "a/b").includes("/"));
  assert(!buildProductIdSegment("en", "US", "a%b").includes("%"));
});

Deno.test("buildProductIdSegment result composes into expected resource name shape", () => {
  const seg = buildProductIdSegment("en", "US", "getpawsy_abc");
  const name = `accounts/5717571566/products/${seg}`;
  assert(/^accounts\/\d+\/products\/[^/]+$/.test(name), "resource name matches Merchant API v1 shape");
});