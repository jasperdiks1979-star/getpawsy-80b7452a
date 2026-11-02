/** An unverified CJ no_data response may advance a scan cursor only when it
 * is atomically persisted in the deferred queue; it is never verified stock. */
export interface StockObservation {
  status: "ok" | "discontinued" | "no_data" | "error";
  confirmed: boolean;
  stock: number | null;
}

export function isDeferrableNoData(result: StockObservation): boolean {
  return result.status === "no_data" && result.confirmed === false && result.stock === null;
}

/** Verify the DB RPC's persisted cursor; do not trust a successful HTTP status. */
export function assertDeferredCursorProgress(
  previous: number,
  persisted: unknown,
  total: number,
): number {
  if (!Number.isSafeInteger(previous) || previous < 0 ||
      !Number.isSafeInteger(total) || total <= 0 ||
      previous >= total ||
      typeof persisted !== "number" || !Number.isSafeInteger(persisted) ||
      persisted !== previous + 1 || persisted > total) {
    throw new Error("Unverified stock deferral did not persist exactly one cursor step");
  }
  return persisted;
}
