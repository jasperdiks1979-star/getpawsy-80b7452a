// Unit tests for Merchant developer-registration v1 classifiers.
// Run: deno test --allow-net --allow-env supabase/functions/merchant-developer-registration/index_test.ts
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { __test } from "./index.ts";

const { classify, classifyGcpLookup, API_VERSION, ENDPOINT_VERSION } = __test;

Deno.test("uses Merchant Accounts API v1 (no v1beta)", async () => {
  assertEquals(API_VERSION, "accounts/v1");
  assertEquals(ENDPOINT_VERSION, "v1");
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // No v1beta URL/path may remain in endpoint construction.
  assert(!/accounts\/v1beta/i.test(src), "v1beta endpoint path still present in index.ts");
  assert(!/merchantapi\.googleapis\.com[^\s"'`]*v1beta/i.test(src), "v1beta merchant URL still present");
});

Deno.test("v1 GET 200 with correct account → ALREADY_REGISTERED_TO_5717571566", () => {
  const r = classify(200, { name: "accounts/5717571566/developerRegistration", gcpIds: ["123"] });
  assertEquals(r.classification, "ALREADY_REGISTERED_TO_5717571566");
  assertEquals(r.merchantAccountFromName, "5717571566");
});

Deno.test("v1 GET 404 → NOT_REGISTERED", () => {
  const r = classify(404, { error: { code: 404, message: "Not found", status: "NOT_FOUND" } });
  assertEquals(r.classification, "NOT_REGISTERED");
});

Deno.test("getAccountForGcpRegistration 200 other account → GCP_ASSOCIATED_WITH_OTHER", () => {
  const r = classifyGcpLookup(200, { account: "accounts/9999999999" });
  assertEquals(r.classification, "GCP_ASSOCIATED_WITH_OTHER");
  assertEquals(r.associatedAccount, "9999999999");
});

Deno.test("getAccountForGcpRegistration 404 → GCP_NOT_ASSOCIATED", () => {
  const r = classifyGcpLookup(404, { error: { code: 404, status: "NOT_FOUND" } });
  assertEquals(r.classification, "GCP_NOT_ASSOCIATED");
});

Deno.test("v1 GET 401 GCP_NOT_REGISTERED → NOT_REGISTERED (definitive)", () => {
  const fixture = {
    error: {
      code: 401,
      status: "UNAUTHENTICATED",
      message: "GCP is not registered.",
      details: [{ metadata: { reason: "GCP_NOT_REGISTERED" } }],
    },
  };
  const r = classify(401, fixture);
  assertEquals(r.classification, "NOT_REGISTERED");
  assertEquals(r.reason, "GCP_NOT_REGISTERED");
});

Deno.test("getAccountForGcpRegistration 401 GCP_NOT_REGISTERED → GCP_NOT_ASSOCIATED", () => {
  const fixture = {
    error: {
      code: 401,
      status: "UNAUTHENTICATED",
      details: [{ metadata: { reason: "GCP_NOT_REGISTERED" } }],
    },
  };
  const r = classifyGcpLookup(401, fixture);
  assertEquals(r.classification, "GCP_NOT_ASSOCIATED");
});

Deno.test("401 with unrelated reason stays INSUFFICIENT_EVIDENCE (canRegister false)", () => {
  const r = classify(401, { error: { code: 401, status: "UNAUTHENTICATED", details: [{ metadata: { reason: "AUTH_ERROR" } }] } });
  assertEquals(r.classification, "INSUFFICIENT_EVIDENCE");
});

Deno.test("401 with no reason stays INSUFFICIENT_EVIDENCE", () => {
  const r = classify(401, { error: { code: 401, status: "UNAUTHENTICATED" } });
  assertEquals(r.classification, "INSUFFICIENT_EVIDENCE");
});

Deno.test("registered-to-other-account keeps canRegister false (verdict logic)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // Verdict only becomes NOT_REGISTERED when BOTH signals agree.
  assertMatch(src, /priorState\.classification === "NOT_REGISTERED"[\s\S]{0,80}gcpLookup\.classification === "GCP_NOT_ASSOCIATED"/);
  // GCP_ASSOCIATED_WITH_OTHER → REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT (canRegister false).
  assertMatch(src, /GCP_ASSOCIATED_WITH_OTHER[\s\S]{0,120}REGISTERED_TO_DIFFERENT_MERCHANT_ACCOUNT/);
});

Deno.test("register action is never invoked automatically (requires explicit action)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // Default action is 'check' when body missing/invalid.
  assertMatch(src, /body\.action === "register" \? "register" : "check"/);
  // The registerGcp URL is only fetched after action==='register' branch guards.
  assertMatch(src, /if \(action === "check"\)/);
});

Deno.test("permission error → CALLER_NOT_MERCHANT_ADMIN", () => {
  const r = classify(403, { error: { code: 403, status: "PERMISSION_DENIED", message: "caller must be admin" } });
  assertEquals(r.classification, "CALLER_NOT_MERCHANT_ADMIN");
});

Deno.test("V1BETA_RAMP_DOWN fixture → ENDPOINT_VERSION_OBSOLETE (never NOT_REGISTERED)", () => {
  const fixture = {
    error: {
      code: 409,
      status: "FAILED_PRECONDITION",
      message: "The v1beta version has been ramped down.",
      details: [{ metadata: { reason: "V1BETA_RAMP_DOWN" } }],
    },
  };
  const r = classify(409, fixture);
  assertEquals(r.classification, "ENDPOINT_VERSION_OBSOLETE");
  assert(r.classification !== ("NOT_REGISTERED" as unknown));
});

Deno.test("Merchant API disabled → MERCHANT_API_NOT_ENABLED", () => {
  const fixture = {
    error: {
      code: 403,
      status: "PERMISSION_DENIED",
      message: "Merchant API has not been used in project 12345 or it is disabled.",
      details: [{ metadata: { reason: "SERVICE_DISABLED" } }],
    },
  };
  const r = classify(403, fixture);
  assertEquals(r.classification, "MERCHANT_API_NOT_ENABLED");
});

Deno.test("no secrets leak in source", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // No hardcoded secret patterns; token values never returned as fields.
  assertMatch(src, /Authorization: `Bearer \$\{accessToken\}`/);
  assert(!/refresh_token"\s*:/i.test(src));
  assert(!/client_secret"\s*:/i.test(src));
});

Deno.test("Register GCP gate: only NOT_REGISTERED enables registration", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // The registerGcp path is only reached when verdict === 'NOT_REGISTERED'.
  assertMatch(src, /verdict !== "NOT_REGISTERED"/);
  assertMatch(src, /canRegister: verdict === "NOT_REGISTERED"/);
});