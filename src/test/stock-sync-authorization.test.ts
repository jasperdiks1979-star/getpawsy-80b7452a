import { describe, expect, it } from "vitest";
import { isAuthorizedStockSyncServiceRequest } from "../../supabase/functions/_shared/stock-sync-auth";

describe("stock-sync service authorization", () => {
  const key = "private-service-role-token";
  it("rejects unauthenticated and anon calls even if body claims cron", () => {
    expect(isAuthorizedStockSyncServiceRequest(null, key)).toBe(false);
    expect(isAuthorizedStockSyncServiceRequest("Bearer public-anon-token", key)).toBe(false);
    expect(isAuthorizedStockSyncServiceRequest("Bearer public-anon-token", key)).toBe(false);
  });
  it("accepts only the exact service-role bearer credential", () => {
    expect(isAuthorizedStockSyncServiceRequest(`Bearer ${key}`, key)).toBe(true);
    expect(isAuthorizedStockSyncServiceRequest(`bearer ${key}`, key)).toBe(false);
    expect(isAuthorizedStockSyncServiceRequest(key, key)).toBe(false);
  });
  it("fails closed when the service credential is not configured", () => {
    expect(isAuthorizedStockSyncServiceRequest("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedStockSyncServiceRequest("Bearer ", "")).toBe(false);
  });
});
