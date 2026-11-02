/** A supplier check is fresh only when CJ confirmed a concrete stock value.
 * An API error or an empty inventory response must not make old stock appear fresh.
 */
export interface SupplierStockCheck {
  confirmed: boolean;
  stock: number | null;
  status: "ok" | "discontinued" | "no_data" | "error";
  warehouse: string;
}

export function confirmedStockFreshnessFields(
  result: SupplierStockCheck,
  checkedAt: string,
): { last_stock_sync_at?: string; stock_source?: "CJ"; supplier_warehouse?: string } {
  if (!result.confirmed || result.stock === null ||
      (result.status !== "ok" && result.status !== "discontinued")) {
    return {};
  }
  return {
    last_stock_sync_at: checkedAt,
    stock_source: "CJ",
    supplier_warehouse: result.warehouse,
  };
}
