import { assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MerchantApiClient, MerchantApiClientError } from "../merchant-api.ts";

Deno.test("deleteProductInput refuses when data source unresolved", async () => {
  Deno.env.delete("MERCHANT_API_DATA_SOURCE_NAME");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "cid");
  Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "cs");
  Deno.env.set("TOKEN_ENCRYPTION_KEY", "k".repeat(32));
  const supabase = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle() { return Promise.resolve({ data: { id: "r", encrypted_refresh_token: btoa("iv") + ":" + btoa("ct"), merchant_center_id: "5717571566", is_connected: true }, error: null }); },
    update() { return { eq: () => Promise.resolve({ error: null }) }; },
  } as never;
  const c = new MerchantApiClient({
    supabase,
    fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 })),
  });
  await assertRejects(
    () => c.deleteProductInput({ contentLanguage: "en", feedLabel: "US", offerId: "getpawsy_x" }),
    MerchantApiClientError,
  );
});