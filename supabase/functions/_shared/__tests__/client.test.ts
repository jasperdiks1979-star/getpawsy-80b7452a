import { assertEquals, assert, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MerchantApiClient, MerchantApiClientError, redact } from "../merchant-api.ts";

function stubSupabase(row: { encrypted_refresh_token: string; merchant_center_id: string; id: string; is_connected: boolean } | null) {
  return {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: row, error: null }); },
    update() { return { eq: () => Promise.resolve({ error: null }) }; },
  } as never;
}

function encryptedFixture(): string { return btoa("iv") + ":" + btoa("ct"); }

function baseEnv() {
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "cid");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "cs");
  Deno.env.set("TOKEN_ENCRYPTION_KEY", "k".repeat(32));
  Deno.env.set("MERCHANT_API_DATA_SOURCE_NAME", "accounts/123/dataSources/456");
}

Deno.test("redact strips ya29 tokens", () => {
  assert(redact("Bearer ya29.AbcDefGhi_012345678").includes("[REDACTED]"));
});

Deno.test("resolveAccount builds accounts/<id>", async () => {
  baseEnv();
  const c = new MerchantApiClient({
    supabase: stubSupabase({ id: "r1", encrypted_refresh_token: encryptedFixture(), merchant_center_id: "5717571566", is_connected: true }),
    fetchImpl: () => Promise.reject(new Error("no fetch expected")) as never,
  });
  assertEquals(await c.resolveAccount(), "accounts/5717571566");
});

Deno.test("resolveDataSourceName fails closed when env unset", () => {
  Deno.env.delete("MERCHANT_API_DATA_SOURCE_NAME");
  const c = new MerchantApiClient({ supabase: stubSupabase(null), fetchImpl: fetch });
  let threw = false;
  try { c.resolveDataSourceName(); } catch (e) { threw = e instanceof MerchantApiClientError && e.message === "data_source_unresolved"; }
  assert(threw);
});

Deno.test("resolveDataSourceName rejects malformed name", () => {
  Deno.env.set("MERCHANT_API_DATA_SOURCE_NAME", "not-a-resource");
  const c = new MerchantApiClient({ supabase: stubSupabase(null), fetchImpl: fetch });
  let threw = false;
  try { c.resolveDataSourceName(); } catch (e) { threw = e instanceof MerchantApiClientError; }
  assert(threw);
});

Deno.test("buildProductInputName encodes identity segment", () => {
  baseEnv();
  const c = new MerchantApiClient({ supabase: stubSupabase(null), fetchImpl: fetch });
  const n = c.buildProductInputName("accounts/9", { contentLanguage: "en", feedLabel: "US", offerId: "getpawsy_abc/1" });
  assertEquals(n, "accounts/9/productInputs/" + encodeURIComponent("en~US~getpawsy_abc/1"));
});

Deno.test("insertProductInput fails closed when data source unresolved", async () => {
  baseEnv();
  Deno.env.delete("MERCHANT_API_DATA_SOURCE_NAME");
  const c = new MerchantApiClient({
    supabase: stubSupabase({ id: "r1", encrypted_refresh_token: encryptedFixture(), merchant_center_id: "5717571566", is_connected: true }),
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 })),
  });
  await assertRejects(
    () => c.insertProductInput({ offerId: "x", contentLanguage: "en", feedLabel: "US", attributes: {} }),
    MerchantApiClientError,
  );
});