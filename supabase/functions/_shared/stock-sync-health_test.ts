import { assessStockSyncHealth } from "./stock-sync-health.ts";

Deno.test("running CJ sync with stale progress must be reported as stalled", () => {
  const now = Date.parse("2026-10-31T12:45:00Z");
  const health = assessStockSyncHealth({
    status: "running",
    started_at: "2026-10-28T03:07:00Z",
    last_sync_at: "2026-10-31T03:11:27Z",
  }, now);
  if (!health.stalled || !health.running || (health.ageMinutes ?? 0) < 500) {
    throw new Error(`Expected stalled CJ sync, received ${JSON.stringify(health)}`);
  }
});

Deno.test("healthy recent sync and completed sync do not alert", () => {
  const now = Date.parse("2026-10-31T12:45:00Z");
  if (assessStockSyncHealth({ status: "running", last_sync_at: "2026-10-31T12:30:00Z" }, now).stalled) {
    throw new Error("Recent progress incorrectly flagged");
  }
  if (assessStockSyncHealth({ status: "completed", last_sync_at: "2026-10-30T00:00:00Z" }, now).stalled) {
    throw new Error("Completed sync incorrectly flagged");
  }
});
