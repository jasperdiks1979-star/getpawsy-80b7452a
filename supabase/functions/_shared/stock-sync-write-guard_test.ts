import { strictEqual as assertEquals, throws } from "node:assert";
function assertThrows(fn: () => unknown, errorType: typeof Error, message: string) {
  throws(fn, (error: unknown) => error instanceof errorType && error.message.includes(message));
}
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

Deno.test("database error takes precedence even if a row was returned", () => {
  assertThrows(
    () => assertStockProductUpdateSucceeded({ message: "transaction aborted" }, [{ id: "product-1" }]),
    Error, "transaction aborted",
  );
});
