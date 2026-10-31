import { isAuthorizedStockSyncServiceRequest } from "./stock-sync-auth.ts";

Deno.test("stock sync service guard rejects caller-controlled cron claims", () => {
  const service = "private-service-token";
  for (const header of [null, "", "Bearer public-anon-token", "Bearer", "bearer private-service-token"]) {
    if (isAuthorizedStockSyncServiceRequest(header, service)) {
      throw new Error(`Unexpected authorization for ${String(header)}`);
    }
  }
  if (!isAuthorizedStockSyncServiceRequest(`Bearer ${service}`, service)) {
    throw new Error("Exact service role bearer token should authorize");
  }
  if (isAuthorizedStockSyncServiceRequest("Bearer undefined", undefined)) {
    throw new Error("Missing service key must fail closed");
  }
});
