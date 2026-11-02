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
  return isServiceRequest || (isAuthenticatedAdmin && action === "resume");
}
