/** Reject replayed or skipped batches before they touch supplier inventory. */
export function assertStockSyncBatchOffset(
  requestedOffset: number,
  checkpoint: { last_offset: number; status: string },
): void {
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new Error(`Invalid stock sync offset: ${requestedOffset}`);
  }
  // A fresh offset=0 is only safe when no partially processed run exists.
  // The authenticated resume path resolves a running checkpoint to its saved
  // offset before calling this guard. A plain admin sync-batch must not erase
  // a running 211/773 checkpoint by implicitly restarting at zero.
  if (requestedOffset === 0 && checkpoint.status === "running" && checkpoint.last_offset > 0) {
    throw new Error(`Cannot restart active stock sync at zero; resume from checkpoint ${checkpoint.last_offset}`);
  }
  if (requestedOffset > 0 &&
      (checkpoint.status !== "running" || checkpoint.last_offset !== requestedOffset)) {
    throw new Error(
      `Out-of-order stock sync batch: requested ${requestedOffset}, checkpoint ${checkpoint.last_offset} (${checkpoint.status})`,
    );
  }
}

/**
 * An offset is only meaningful for the catalog size captured when the run
 * started. Inserting/deleting CJ products mid-run can shift sorted offsets
 * and silently skip a product. Stop without advancing the checkpoint.
 *
 * This guard catches count drift; a stable ID snapshot is still needed to
 * detect replacements that leave the count unchanged.
 */
export function assertStockSyncCatalogStable(
  offset: number,
  savedTotal: number,
  currentTotal: number,
): void {
  if (offset === 0) return; // New run captures a fresh catalog size.
  if (!Number.isSafeInteger(savedTotal) || savedTotal <= 0 ||
      !Number.isSafeInteger(currentTotal) || currentTotal !== savedTotal) {
    throw new Error(
      `Stock sync catalog changed during active run (saved=${savedTotal}, current=${currentTotal}); checkpoint preserved`,
    );
  }
}
