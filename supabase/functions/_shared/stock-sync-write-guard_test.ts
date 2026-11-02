import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStockProductUpdateSucceeded } from "./stock-sync-write-guard.ts";

Deno.test("one persisted product row permits checkpoint advancement", () => {
  assertEquals(assertStockProductUpdateSucceeded(null, [{ id: "product-1" }]), undefined);
});

Deno.test("failed product write halts batch before checkpoint advancement", () => {
  assertThrows(
    () => assertStockProductUpdateSucceeded({ message: "DB temporarily unavailable" }, null),
    Error, "checkpoint preserved",
  );
});

Deno.test("zero matching product rows must not consume checkpoint", () => {
  assertThrows(
    () => assertStockProductUpdateSucceeded(null, []),
    Error, "affected 0 rows; checkpoint preserved",
  );
});

Deno.test("missing returned rows must not consume checkpoint", () => {
  assertThrows(
    () => assertStockProductUpdateSucceeded(null, null),
    Error, "checkpoint preserved",
  );
});

Deno.test("unexpected multiple product rows must not consume checkpoint", () => {
  assertThrows(
    () => assertStockProductUpdateSucceeded(null, [{ id: "a" }, { id: "b" }]),
    Error, "affected 2 rows; checkpoint preserved",
  );
});
