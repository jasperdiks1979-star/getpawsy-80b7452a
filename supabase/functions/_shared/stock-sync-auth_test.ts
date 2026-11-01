import { isAuthorizedStockSyncServiceRequest, shouldContinueStockSync } from "./stock-sync-auth.ts";

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

Deno.test("stock sync continuation requires a service credential or verified admin resume", () => {
  const cases: Array<[boolean, boolean, string, boolean]> = [
    [true, false, "sync-batch", true],
    [true, false, "resume", true],
    [false, true, "resume", true],
    [false, true, "sync-batch", false],
    [false, false, "resume", false],
    [false, false, "sync-batch", false],
    [false, false, "cron", false],
  ];
  for (const [service, admin, action, expected] of cases) {
    if (shouldContinueStockSync(service, admin, action) !== expected) {
      throw new Error(`Unexpected continuation policy: service=${service}, admin=${admin}, action=${action}`);
    }
  }
});
