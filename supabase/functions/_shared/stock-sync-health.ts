/** Read-only health classification for the CJ sync_progress pipeline.
 * Do not use updated_at: it can change without any supplier sync progress.
 */
export interface StockSyncProgress {
  status: string | null;
  started_at?: string | null;
  last_sync_at?: string | null;
}

export interface StockSyncHealth {
  running: boolean;
  stalled: boolean;
  ageMinutes: number | null;
}

export function assessStockSyncHealth(
  progress: StockSyncProgress | null,
  nowMs: number = Date.now(),
  staleAfterMs: number = 30 * 60 * 1000,
): StockSyncHealth {
  if (!progress || progress.status !== "running") {
    return { running: false, stalled: false, ageMinutes: null };
  }

  const lastProgressAt = progress.last_sync_at ?? progress.started_at;
  const lastProgressMs = lastProgressAt ? Date.parse(lastProgressAt) : NaN;
  if (!Number.isFinite(lastProgressMs)) {
    // A running sync without a valid progress timestamp must not be reported healthy.
    return { running: true, stalled: true, ageMinutes: null };
  }

  const ageMs = Math.max(0, nowMs - lastProgressMs);
  return {
    running: true,
    stalled: ageMs >= staleAfterMs,
    ageMinutes: Math.floor(ageMs / 60_000),
  };
}
