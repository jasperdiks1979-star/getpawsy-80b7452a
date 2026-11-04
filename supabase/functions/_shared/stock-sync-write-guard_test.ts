import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStockProductUpdateSucceeded } from "./stock-sync-write-guard.ts";

Deno.test("confirmed product write permits checkpoint advancement", () => {
  assertEquals(assertStockProductUpdateSucceeded(null), undefined);
});

Deno.test("failed product write halts batch before checkpoint advancement", () => {
  assertThrows(() => assertStockProductUpdateSucceeded({ message: "DB temporarily unavailable" }),
    Error, "checkpoint preserved");
});
