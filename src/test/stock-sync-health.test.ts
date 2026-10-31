import { describe, expect, it } from "vitest";
import { assessStockSyncHealth } from "../../supabase/functions/_shared/stock-sync-health";

describe("CJ sync progress health", () => {
  const now = Date.parse("2026-10-31T12:45:00Z");
  const running = (last_sync_at: string | null, started_at = "2026-10-31T10:00:00Z") => ({
    status: "running",
    started_at,
    last_sync_at,
  });

  it("does not mistake absent or completed syncs for stalled runs", () => {
    expect(assessStockSyncHealth(null, now).stalled).toBe(false);
    expect(assessStockSyncHealth({ status: "completed", last_sync_at: "2026-10-30T00:00:00Z" }, now).stalled).toBe(false);
  });

  it("detects a running sync that stopped progressing for 30 minutes", () => {
    expect(assessStockSyncHealth(running("2026-10-31T12:16:00Z"), now).stalled).toBe(false);
    expect(assessStockSyncHealth(running("2026-10-31T12:15:00Z"), now)).toMatchObject({ running: true, stalled: true, ageMinutes: 30 });
    expect(assessStockSyncHealth(running("2026-10-31T12:14:00Z"), now).ageMinutes).toBe(31);
  });

  it("falls back to start time if there has never been a successful batch", () => {
    expect(assessStockSyncHealth(running(null), now).stalled).toBe(true);
  });

  it("fails closed on invalid timestamps and ignores future clock skew", () => {
    expect(assessStockSyncHealth(running("invalid", "invalid"), now).stalled).toBe(true);
    expect(assessStockSyncHealth(running("2026-10-31T13:00:00Z"), now)).toMatchObject({ stalled: false, ageMinutes: 0 });
  });

  it("uses last_sync_at rather than an unrelated updated_at heartbeat", () => {
    const progress = { ...running("2026-10-31T03:11:27Z"), updated_at: "2026-10-31T12:44:00Z" };
    expect(assessStockSyncHealth(progress, now).stalled).toBe(true);
  });
});
