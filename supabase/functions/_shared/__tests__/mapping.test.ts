import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contentV21ToProductInput, toMoney } from "../merchant-api-mapping.ts";

Deno.test("toMoney converts USD value to micros string", () => {
  assertEquals(toMoney({ value: "12.99", currency: "USD" }), { amountMicros: "12990000", currencyCode: "USD" });
});

Deno.test("toMoney passes through v1 shape", () => {
  assertEquals(toMoney({ amountMicros: "9990000", currencyCode: "USD" }), { amountMicros: "9990000", currencyCode: "USD" });
});

Deno.test("toMoney returns undefined on empty", () => {
  assertEquals(toMoney(undefined), undefined);
  assertEquals(toMoney({ value: "", currency: "USD" }), undefined);
});

Deno.test("mapping requires offerId", () => {
  assertThrows(() => contentV21ToProductInput({}), Error, "mapping_missing_offerId");
});

Deno.test("mapping produces canonical ProductInput", () => {
  const r = contentV21ToProductInput({
    offerId: "getpawsy_abc",
    contentLanguage: "en",
    targetCountry: "US",
    title: "Cat Bed",
    description: "Soft cat bed",
    link: "https://getpawsy.pet/products/cat-bed",
    imageLink: "https://cdn.example/cat.jpg",
    availability: "in_stock",
    condition: "new",
    brand: "GetPawsy",
    price: { value: "29.99", currency: "USD" },
    productType: "Pet Supplies > Cat Supplies > Beds",
    customLabel0: "Best-Seller",
  });
  assertEquals(r.input.offerId, "getpawsy_abc");
  assertEquals(r.input.feedLabel, "US");
  assertEquals(r.input.attributes.price, { amountMicros: "29990000", currencyCode: "USD" });
  assertEquals(r.input.attributes.productTypes, ["Pet Supplies", "Cat Supplies", "Beds"]);
  assertEquals(r.warnings.length, 0);
});

Deno.test("mapping records sale price separately", () => {
  const r = contentV21ToProductInput({ offerId: "x", price: { value: "20", currency: "USD" }, salePrice: { value: "15", currency: "USD" } });
  assertEquals(r.input.attributes.salePrice, { amountMicros: "15000000", currencyCode: "USD" });
});

Deno.test("mapping omits absent gtin/mpn", () => {
  const r = contentV21ToProductInput({ offerId: "x" });
  assertEquals(r.input.attributes.gtin, undefined);
  assertEquals(r.input.attributes.mpn, undefined);
});

Deno.test("mapping preserves out-of-stock availability", () => {
  const r = contentV21ToProductInput({ offerId: "x", availability: "out_of_stock" });
  assertEquals(r.input.attributes.availability, "out_of_stock");
});

Deno.test("mapping warns on unknown legacy field but does not drop silently", () => {
  const r = contentV21ToProductInput({ offerId: "x", weirdField: "?" } as never);
  assertEquals(r.warnings.some((w) => w.startsWith("unknown_legacy_field:weirdField")), true);
});

Deno.test("mapping normalises shipping money shape", () => {
  const r = contentV21ToProductInput({
    offerId: "x",
    shipping: [{ country: "US", service: "Standard", price: { value: "5.99", currency: "USD" } }],
  });
  const s = (r.input.attributes.shipping ?? [])[0] as Record<string, unknown>;
  assertEquals(s.price, { amountMicros: "5990000", currencyCode: "USD" });
});

Deno.test("mapping handles duplicate offerIds by trusting input identity", () => {
  const a = contentV21ToProductInput({ offerId: "dup" }).input;
  const b = contentV21ToProductInput({ offerId: "dup" }).input;
  assertEquals(a.offerId, b.offerId);
});

Deno.test("mapping keeps numeric googleProductCategory as string", () => {
  const r = contentV21ToProductInput({ offerId: "x", googleProductCategory: 5595 });
  assertEquals(r.input.attributes.googleProductCategory, "5595");
});