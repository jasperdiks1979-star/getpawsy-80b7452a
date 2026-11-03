/** Only a real service-role bearer token may invoke privileged stock sync.
 * The JSON body (including source: "cron") is caller-controlled and NEVER
 * grants authorization. This Edge Function has verify_jwt=false.
 */
export function isAuthorizedStockSyncServiceRequest(
  authorizationHeader: string | null,
  serviceRoleKey: string | null | undefined,
): boolean {
  return Boolean(serviceRoleKey) && authorizationHeader === `Bearer ${serviceRoleKey}`;
}

/** The caller cannot choose its own privilege level via a JSON action.
 * An explicit resume is permitted only after verified admin authentication.
 */
export function shouldContinueStockSync(
  isServiceRequest: boolean,
  isAuthenticatedAdmin: boolean,
  action: string,
): boolean {
  // Watchdog recovery is deliberately one batch: never start a background chain.
  if (action === "watchdog-once") return false;
  return isServiceRequest || (isAuthenticatedAdmin && action === "resume");
}

/** Only the service watchdog can resume exactly its leased checkpoint.
 * The caller must supply the expected offset so a concurrent cron advance
 * fails closed instead of silently recovering a different product.
 */
export function resolveWatchdogSingleBatchOffset(
  isServiceRequest: boolean,
  action: string,
  requestedOffset: number,
  progress: { last_offset: number; total_products: number; status: string },
): number | null {
  if (action !== "watchdog-once") return null;
  if (!isServiceRequest) throw new Error("Watchdog requires service-role authorization");
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset <= 0 ||
      !Number.isSafeInteger(progress.last_offset) ||
      !Number.isSafeInteger(progress.total_products) ||
      progress.status !== "running" ||
      progress.last_offset !== requestedOffset ||
      requestedOffset >= progress.total_products) {
    throw new Error("Watchdog checkpoint changed or is not a partial running sync");
  }
  return requestedOffset;
}
