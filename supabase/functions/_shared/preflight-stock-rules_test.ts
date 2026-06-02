import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateStockRules } from "./preflight-stock-rules.ts";

Deno.test("preflight stock rules — in-stock active product passes", () => {
  const r = evaluateStockRules({ product: { stock: 10, is_active: true }, forceOverride: false });
  assertEquals(r.reasons, []);
  assertEquals(r.bypassed, []);
});

Deno.test("preflight stock rules — out-of-stock blocks", () => {
  const r = evaluateStockRules({ product: { stock: 0, is_active: true }, forceOverride: false });
  assertEquals(r.reasons, ["product_out_of_stock"]);
  assertEquals(r.bypassed, []);
});

Deno.test("preflight stock rules — negative stock blocks", () => {
  const r = evaluateStockRules({ product: { stock: -3, is_active: true }, forceOverride: false });
  assertEquals(r.reasons, ["product_out_of_stock"]);
});

Deno.test("preflight stock rules — inactive product blocks", () => {
  const r = evaluateStockRules({ product: { stock: 10, is_active: false }, forceOverride: false });
  assertEquals(r.reasons, ["product_inactive"]);
});

Deno.test("preflight stock rules — both inactive and OOS blocks with both reasons", () => {
  const r = evaluateStockRules({ product: { stock: 0, is_active: false }, forceOverride: false });
  assertEquals(r.reasons, ["product_inactive", "product_out_of_stock"]);
  assertEquals(r.bypassed, []);
});

Deno.test("preflight stock rules — force override moves OOS to bypassed", () => {
  const r = evaluateStockRules({ product: { stock: 0, is_active: true }, forceOverride: true });
  assertEquals(r.reasons, []);
  assertEquals(r.bypassed, ["product_out_of_stock"]);
});

Deno.test("preflight stock rules — force override bypasses inactive + OOS together", () => {
  const r = evaluateStockRules({ product: { stock: 0, is_active: false }, forceOverride: true });
  assertEquals(r.reasons, []);
  assertEquals(r.bypassed, ["product_inactive", "product_out_of_stock"]);
});

Deno.test("preflight stock rules — null stock is not OOS (unknown stock ≠ zero)", () => {
  const r = evaluateStockRules({ product: { stock: null, is_active: true }, forceOverride: false });
  assertEquals(r.reasons, []);
});

Deno.test("preflight stock rules — missing product yields no stock reasons", () => {
  const r = evaluateStockRules({ product: null, forceOverride: false });
  assertEquals(r.reasons, []);
  assertEquals(r.bypassed, []);
});