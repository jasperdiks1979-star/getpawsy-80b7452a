import { deepStrictEqual, strictEqual } from "node:assert";
import { warehouseObservation } from "./stock-sync-warehouse.ts";

const row = (countryCode: string, totalInventoryNum: number) => ({countryCode, totalInventoryNum});
Deno.test("empty inventory cannot confirm a zero", () => {
  for (const input of [[], null, undefined]) {
    const result = warehouseObservation(input);
    deepStrictEqual([result.confirmed, result.stock], [false, null]);
  }
});
Deno.test("mixed fallback warehouses cannot be credited to the first country", () => {
  const result = warehouseObservation([row("CN", 0), row("DE", 15)]);
  deepStrictEqual([result.confirmed, result.stock], [false, null]);
});
Deno.test("explicit US zero and same-country sums remain authoritative", () => {
  strictEqual(warehouseObservation([row("CN", 15), row("US", 0)]).stock, 0);
  strictEqual(warehouseObservation([row("US", 5), row("US", 7)]).stock, 12);
});
