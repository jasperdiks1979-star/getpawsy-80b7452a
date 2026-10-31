import { describe, expect, it } from "vitest";
import { computeAvailability, isSupplierStockVerified, MAX_STOCK_SYNC_AGE_MS } from "../lib/availability";

const NOW = Date.parse("2026-10-31T20:00:00Z");
const fresh = new Date().toISOString();

describe("supplier-verified storefront availability", () => {
  it("rejects preserved positive stock when CJ returned no_data", () => {
    expect(computeAvailability({ is_active: true, stock: 101, stock_sync_status: "no_data", supplier_warehouse: "unknown" }).isInStock).toBe(false);
  });
  it("rejects unknown warehouse even with sync status ok", () => {
    expect(computeAvailability({ is_active: true, stock: 98, stock_sync_status: "ok", supplier_warehouse: "unknown" }).isInStock).toBe(false);
  });
  it("accepts confirmed stock from checkout-compatible US and CN warehouses", () => {
    expect(computeAvailability({ is_active: true, stock: 10, stock_sync_status: "ok", supplier_warehouse: "US", last_stock_sync_at: fresh }).isInStock).toBe(true);
    expect(computeAvailability({ is_active: true, stock: 10, stock_sync_status: "ok", supplier_warehouse: "CN", last_stock_sync_at: fresh }).isInStock).toBe(true);
  });
  it("fails closed for null supplier fields from live catalog", () => {
    expect(computeAvailability({ is_active: true, stock: 10, stock_sync_status: null, supplier_warehouse: null }).isInStock).toBe(false);
  });
  it("preserves legacy behavior for local objects with no supplier metadata", () => {
    expect(computeAvailability({ is_active: true, stock: 10 }).isInStock).toBe(true);
  });
  it("never exposes unverified or legacy cached catalog rows as buyable", () => {
    expect(isSupplierStockVerified({ stock_sync_status: "no_data", supplier_warehouse: "unknown" })).toBe(false);
    expect(isSupplierStockVerified({ stock_sync_status: null, supplier_warehouse: null })).toBe(false);
    expect(isSupplierStockVerified({})).toBe(false);
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: " US ", last_stock_sync_at: new Date(NOW).toISOString() }, NOW)).toBe(true);
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: "CN", last_stock_sync_at: new Date(NOW).toISOString() }, NOW)).toBe(true);
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: "unknown" })).toBe(false);
  });
  it("rejects old successful supplier syncs and missing timestamps", () => {
    const base = { stock_sync_status: "ok", supplier_warehouse: "US" };
    expect(isSupplierStockVerified(base, NOW)).toBe(false);
    expect(isSupplierStockVerified({ ...base, last_stock_sync_at: new Date(NOW - MAX_STOCK_SYNC_AGE_MS - 1).toISOString() }, NOW)).toBe(false);
    expect(isSupplierStockVerified({ ...base, last_stock_sync_at: new Date(NOW - MAX_STOCK_SYNC_AGE_MS + 1).toISOString() }, NOW)).toBe(true);
  });
  it("rejects malformed and implausibly future-dated timestamps", () => {
    const base = { stock_sync_status: "ok", supplier_warehouse: "US" };
    expect(isSupplierStockVerified({ ...base, last_stock_sync_at: "not-a-date" }, NOW)).toBe(false);
    expect(isSupplierStockVerified({ ...base, last_stock_sync_at: new Date(NOW + 6 * 60 * 1000).toISOString() }, NOW)).toBe(false);
  });

});
