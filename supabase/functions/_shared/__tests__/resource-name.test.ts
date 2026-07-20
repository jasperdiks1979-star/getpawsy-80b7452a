import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MerchantApiClient } from "../merchant-api.ts";

Deno.test("buildProductInputName produces stable format", () => {
  const c = new MerchantApiClient({ supabase: {} as never, fetchImpl: fetch });
  assertEquals(
    c.buildProductInputName("accounts/5717571566", { contentLanguage: "en", feedLabel: "US", offerId: "abc" }),
    "accounts/5717571566/productInputs/en~US~abc",
  );
});

Deno.test("buildProductInputName percent-encodes special chars", () => {
  const c = new MerchantApiClient({ supabase: {} as never, fetchImpl: fetch });
  assertEquals(
    c.buildProductInputName("accounts/1", { contentLanguage: "en", feedLabel: "US", offerId: "a b" }),
    "accounts/1/productInputs/" + encodeURIComponent("en~US~a b"),
  );
});