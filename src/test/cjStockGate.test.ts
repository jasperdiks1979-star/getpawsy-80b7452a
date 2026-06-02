import { describe, it, expect } from "vitest";
import { evaluateCjStockGate, CJ_STOCK_STALE_MS } from "@/utils/cjStockGate";

const NOW = new Date("2026-06-02T12:00:00Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe("evaluateCjStockGate", () => {
  describe("fresh inventory (< 12h old)", () => {
    it("passes for dry-run", () => {
      const r = evaluateCjStockGate({ lastSyncAt: hoursAgo(2), dryRun: true, now: NOW });
      expect(r.stale).toBe(false);
      expect(r.action).toBe("pass");
    });
    it("passes for paid run", () => {
      const r = evaluateCjStockGate({ lastSyncAt: hoursAgo(11), dryRun: false, now: NOW });
      expect(r.stale).toBe(false);
      expect(r.action).toBe("pass");
    });
    it("boundary: exactly at threshold is still fresh", () => {
      const r = evaluateCjStockGate({
        lastSyncAt: new Date(NOW - CJ_STOCK_STALE_MS).toISOString(),
        dryRun: false,
        now: NOW,
      });
      expect(r.action).toBe("pass");
    });
  });

  describe("stale inventory (> 12h old)", () => {
    it("warns only on dry-run (non-blocking)", () => {
      const r = evaluateCjStockGate({ lastSyncAt: hoursAgo(24), dryRun: true, now: NOW });
      expect(r.stale).toBe(true);
      expect(r.action).toBe("warn");
      expect(r.label).toBe("24h old");
    });
    it("blocks paid runs", () => {
      const r = evaluateCjStockGate({ lastSyncAt: hoursAgo(48), dryRun: false, now: NOW });
      expect(r.stale).toBe(true);
      expect(r.action).toBe("block");
      expect(r.label).toBe("48h old");
    });
  });

  describe("never-synced inventory", () => {
    it("warns on dry-run", () => {
      const r = evaluateCjStockGate({ lastSyncAt: null, dryRun: true, now: NOW });
      expect(r.action).toBe("warn");
      expect(r.label).toBe("never synced");
      expect(r.ageMs).toBeNull();
    });
    it("blocks paid run", () => {
      const r = evaluateCjStockGate({ lastSyncAt: undefined, dryRun: false, now: NOW });
      expect(r.action).toBe("block");
      expect(r.label).toBe("never synced");
    });
  });

  it("accepts Date objects equivalently to ISO strings", () => {
    const iso = evaluateCjStockGate({ lastSyncAt: hoursAgo(3), dryRun: false, now: NOW });
    const date = evaluateCjStockGate({ lastSyncAt: new Date(NOW - 3 * 3_600_000), dryRun: false, now: NOW });
    expect(iso).toEqual(date);
  });
});