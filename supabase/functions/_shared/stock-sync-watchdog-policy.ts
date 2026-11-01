/** Recovery must be explicitly enabled and authenticated with the server credential.
 * The JSON request body cannot confer privilege. No credentials are logged.
 */
export function canRunStockSyncWatchdog(
  method: string,
  authorization: string | null,
  serviceKey: string | undefined,
  enabled: string | undefined,
): boolean {
  return method === "POST" && enabled === "true" &&
    Boolean(serviceKey) && authorization === `Bearer ${serviceKey}`;
}
