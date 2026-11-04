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

/** A processed checkpoint must represent a verified CJ inventory observation.
 * A no_data or API-error result cannot be counted as a synced product merely
 * because its diagnostic status was successfully written to Postgres.
 * Throw before the product update so the current checkpoint remains retryable.
 */
export function assertVerifiedStockObservation(result: SupplierStockCheck): void {
  if (!result.confirmed || result.stock === null ||
      !Number.isSafeInteger(result.stock) || result.stock < 0 ||
      (result.status !== "ok" && result.status !== "discontinued") ||
      (result.status === "discontinued" && result.stock !== 0)) {
    throw new Error("Unverified CJ stock observation; checkpoint must not advance");
  }
}
