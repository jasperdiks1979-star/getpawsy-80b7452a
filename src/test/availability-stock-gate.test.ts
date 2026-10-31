import { describe, expect, it } from "vitest";
import { computeAvailability, isSupplierStockVerified } from "../lib/availability";

describe("supplier-verified storefront availability", () => {
  it("rejects preserved positive stock when CJ returned no_data", () => {
    expect(computeAvailability({ is_active: true, stock: 101, stock_sync_status: "no_data", supplier_warehouse: "unknown" }).isInStock).toBe(false);
  });
  it("rejects unknown warehouse even with sync status ok", () => {
    expect(computeAvailability({ is_active: true, stock: 98, stock_sync_status: "ok", supplier_warehouse: "unknown" }).isInStock).toBe(false);
  });
  it("accepts confirmed stock from checkout-compatible US and CN warehouses", () => {
    expect(computeAvailability({ is_active: true, stock: 10, stock_sync_status: "ok", supplier_warehouse: "US" }).isInStock).toBe(true);
    expect(computeAvailability({ is_active: true, stock: 10, stock_sync_status: "ok", supplier_warehouse: "CN" }).isInStock).toBe(true);
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
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: " US " })).toBe(true);
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: "CN" })).toBe(true);
    expect(isSupplierStockVerified({ stock_sync_status: "ok", supplier_warehouse: "unknown" })).toBe(false);
  });
});
