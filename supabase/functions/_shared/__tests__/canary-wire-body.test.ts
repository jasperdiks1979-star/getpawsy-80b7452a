import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildProductInputWireBody, FORBIDDEN_PRODUCT_INPUT_KEYS, parseGoogleError, MERCHANT_API_HOST } from "../merchant-api.ts";
import { validateWireBody } from "../../merchant-api-write-canary/index.ts";

const OFFER = "getpawsy_685f7faf-7809-4962-b408-c2ced99dd178";

function goodAttrs() {
  return {
    title: "Automatic Pet Water Fountain",
    description: "A".repeat(80),
    link: "https://getpawsy.pet/products/x",
    imageLink: "https://cdn.example/x.jpg",
    availability: "in_stock",
    condition: "new",
    price: { amountMicros: "29990000", currencyCode: "USD" },
  };
}

Deno.test("wire body renames attributes → productAttributes and strips channel/targetCountry", () => {
  const wire = buildProductInputWireBody({
    offerId: OFFER,
    contentLanguage: "en",
    feedLabel: "US",
    // legacy Content API fields must be stripped
    channel: "ONLINE",
    targetCountry: "US",
    attributes: goodAttrs(),
  } as never);
  assertEquals(wire.offerId, OFFER);
  assertEquals(wire.contentLanguage, "en");
  assertEquals(wire.feedLabel, "US");
  assert("productAttributes" in wire, "wire body must expose productAttributes");
  for (const k of FORBIDDEN_PRODUCT_INPUT_KEYS) {
    assert(!(k in wire), `forbidden legacy key ${k} must NOT appear on wire body`);
  }
});

Deno.test("validateWireBody accepts a well-formed body", () => {
  const wire = buildProductInputWireBody({
    offerId: OFFER, contentLanguage: "en", feedLabel: "US", attributes: goodAttrs(),
  });
  const f = validateWireBody(wire as unknown as Record<string, unknown>, {} as Record<string, unknown>);
  assertEquals(f.errors, []);
});

Deno.test("validateWireBody flags channel / targetCountry / attributes on wire", () => {
  const bad = {
    offerId: OFFER, contentLanguage: "en", feedLabel: "US",
    channel: "ONLINE", targetCountry: "US", attributes: goodAttrs(),
    productAttributes: goodAttrs(),
  } as Record<string, unknown>;
  const f = validateWireBody(bad, {});
  assert(f.errors.includes("forbidden_legacy_field_on_wire:channel"));
  assert(f.errors.includes("forbidden_legacy_field_on_wire:targetCountry"));
  assert(f.errors.includes("forbidden_legacy_field_on_wire:attributes"));
});

Deno.test("validateWireBody flags missing required productAttributes and bad enums", () => {
  const wire = buildProductInputWireBody({
    offerId: OFFER, contentLanguage: "en", feedLabel: "US",
    attributes: {
      title: "T", description: "d",
      link: "http://insecure", imageLink: "http://insecure",
      availability: "AVAILABLE", condition: "brand_new",
      price: { amountMicros: 29990000 as unknown as string, currencyCode: "EUR" },
    },
  });
  const f = validateWireBody(wire as unknown as Record<string, unknown>, {});
  assert(f.errors.includes("link_not_https"));
  assert(f.errors.includes("imageLink_not_https"));
  assert(f.errors.some((e) => e.startsWith("availability_enum_invalid")));
  assert(f.errors.some((e) => e.startsWith("condition_enum_invalid")));
  assert(f.errors.includes("price_amountMicros_not_string_integer"));
  assert(f.errors.includes("price_currencyCode_not_USD"));
});

Deno.test("insert endpoint contract: path + dataSource query only", () => {
  const account = "accounts/5717571566";
  const dataSource = "accounts/5717571566/dataSources/10690364332";
  const url = new URL(`${MERCHANT_API_HOST}/products/v1/${account}/productInputs:insert`);
  url.searchParams.set("dataSource", dataSource);
  assertEquals(url.pathname, "/products/v1/accounts/5717571566/productInputs:insert");
  assertEquals(url.searchParams.get("dataSource"), dataSource);
  // Percent-encoded exactly once, no doubles
  assert(url.toString().includes("dataSource=accounts%2F5717571566%2FdataSources%2F10690364332"));
});

Deno.test("parseGoogleError extracts code/status/details/fieldViolations", () => {
  const payload = JSON.stringify({
    error: {
      code: 400,
      status: "INVALID_ARGUMENT",
      message: "Request contains an invalid argument.",
      details: [{
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [{ field: "product_input.channel", description: "Unknown field" }],
      }],
    },
  });
  const p = parseGoogleError(payload);
  assertEquals(p?.code, 400);
  assertEquals(p?.status, "INVALID_ARGUMENT");
  assert(Array.isArray(p?.details));
});