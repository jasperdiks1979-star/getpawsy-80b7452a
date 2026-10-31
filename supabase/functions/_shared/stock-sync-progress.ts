/** Reject replayed or skipped batches before they touch supplier inventory. */
export function assertStockSyncBatchOffset(
  requestedOffset: number,
  checkpoint: { last_offset: number; status: string },
): void {
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    throw new Error(`Invalid stock sync offset: ${requestedOffset}`);
  }
  if (requestedOffset > 0 &&
      (checkpoint.status !== "running" || checkpoint.last_offset !== requestedOffset)) {
    throw new Error(
      `Out-of-order stock sync batch: requested ${requestedOffset}, checkpoint ${checkpoint.last_offset} (${checkpoint.status})`,
    );
  }
}
