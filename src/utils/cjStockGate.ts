// Pure helper for the Pinterest Ad Studio CJ-inventory freshness gate.
// Single source of truth used by PinterestAdStudio.handleDirector and tests.

export const CJ_STOCK_STALE_MS = 12 * 60 * 60 * 1000;

export type CjStockGateInput = {
  lastSyncAt: string | Date | null | undefined;
  dryRun: boolean;
  now?: number;
  /**
   * Admin override: when true, a stale-stock state never blocks. The gate
   * still returns `stale: true` and `action: "warn"` so the caller can
   * surface the warning UI and log the bypass.
   */
  override?: boolean;
};

export type CjStockGateAction = "block" | "warn" | "pass";

export type CjStockGateResult = {
  stale: boolean;
  ageMs: number | null;
  action: CjStockGateAction;
  label: string;
};

export function ageLabel(ageMs: number | null): string {
  if (ageMs === null) return "never synced";
  const h = Math.floor(ageMs / 3_600_000);
  return `${h}h old`;
}

export function evaluateCjStockGate(input: CjStockGateInput): CjStockGateResult {
  const now = input.now ?? Date.now();
  const synced = input.lastSyncAt
    ? input.lastSyncAt instanceof Date
      ? input.lastSyncAt
      : new Date(input.lastSyncAt)
    : null;
  const ageMs = synced && !Number.isNaN(synced.getTime()) ? now - synced.getTime() : null;
  const stale = ageMs === null || ageMs > CJ_STOCK_STALE_MS;
  const label = ageLabel(ageMs);
  if (!stale) return { stale, ageMs, action: "pass", label };
  // Stale: block paid runs (forces refresh), warn-only for dry-run.
  // Admin override downgrades the paid block to a warning so the caller
  // can proceed deliberately (still surfaces the stale-stock notice).
  const action: CjStockGateAction = input.dryRun || input.override ? "warn" : "block";
  return { stale, ageMs, action, label };
}