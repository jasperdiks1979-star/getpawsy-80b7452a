import { assertVerifiedStockObservation, confirmedStockFreshnessFields } from "./stock-sync-freshness.ts";

Deno.test("confirmed CJ inventory refreshes the verified stock timestamp", () => {
  const checkedAt = "2026-11-02T00:00:00Z";
  const result = confirmedStockFreshnessFields({
    confirmed: true, stock: 12, status: "ok", warehouse: "US",
  }, checkedAt);
  if (result.last_stock_sync_at !== checkedAt ||
      result.stock_source !== "CJ" || result.supplier_warehouse !== "US") {
    throw new Error("Verified stock did not receive a freshness timestamp");
  }
});

Deno.test("CJ-confirmed zero stock and discontinuation remain verifiable", () => {
  const result = confirmedStockFreshnessFields({
    confirmed: true, stock: 0, status: "discontinued", warehouse: "none",
  }, "2026-11-02T00:00:00Z");
  if (!result.last_stock_sync_at || result.supplier_warehouse !== "none") {
    throw new Error("Confirmed discontinued stock lost its freshness timestamp");
  }
});

Deno.test("CJ no_data, API errors, and null stock cannot refresh stale inventory", () => {
  const cases = [
    { confirmed: false, stock: null, status: "no_data" as const, warehouse: "unknown" },
    { confirmed: false, stock: null, status: "error" as const, warehouse: "unknown" },
    { confirmed: true, stock: null, status: "ok" as const, warehouse: "US" },
    { confirmed: false, stock: 5, status: "ok" as const, warehouse: "US" },
  ];
  for (const value of cases) {
    const result = confirmedStockFreshnessFields(value, "2026-11-02T00:00:00Z");
    if (Object.keys(result).length !== 0) {
      throw new Error(`Unverified CJ result incorrectly marked fresh: ${value.status}`);
    }
  }
});

Deno.test("checkpoint only consumes verified CJ stock observations", () => {
  const valid = [
    { confirmed: true, stock: 0, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: 12, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: 0, status: "discontinued" as const, warehouse: "none" },
  ];
  for (const result of valid) assertVerifiedStockObservation(result);

  const invalid = [
    { confirmed: false, stock: null, status: "no_data" as const, warehouse: "unknown" },
    { confirmed: false, stock: null, status: "error" as const, warehouse: "unknown" },
    { confirmed: false, stock: 0, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: null, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: -1, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: 1.5, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: Number.NaN, status: "ok" as const, warehouse: "US" },
    { confirmed: true, stock: 5, status: "discontinued" as const, warehouse: "none" },
  ];
  for (const result of invalid) {
    let rejected = false;
    try { assertVerifiedStockObservation(result); } catch { rejected = true; }
    if (!rejected) throw new Error(`Unverified CJ ${result.status} was allowed to consume a checkpoint`);
  }
});
