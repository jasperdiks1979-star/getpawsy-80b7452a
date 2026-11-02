/** A scan is not verified complete while any deferred or failed CJ stock check remains. */
export type StockSyncFinalStatus = 'running' | 'completed' | 'needs_review';

export function decideStockSyncFinalStatus(hasMore: boolean, errorCount: number): StockSyncFinalStatus {
  if (!Number.isSafeInteger(errorCount) || errorCount < 0) {
    throw new Error('Invalid stock sync error count');
  }
  if (hasMore) return 'running';
  return errorCount === 0 ? 'completed' : 'needs_review';
}

/** Batch success must not be confused with historical unresolved stock errors.
 * A watchdog can verify today's exact CJ observation even if an earlier
 * product is still in the deferred queue.
 */
export function decideStockSyncBatchOutcome(hasMore: boolean, previousErrors: number, batchErrors: number) {
  if (!Number.isSafeInteger(previousErrors) || previousErrors < 0 ||
      !Number.isSafeInteger(batchErrors) || batchErrors < 0 ||
      !Number.isSafeInteger(previousErrors + batchErrors)) {
    throw new Error('Invalid stock sync error count');
  }
  const errorCount = previousErrors + batchErrors;
  return {
    success: batchErrors === 0,
    allVerified: errorCount === 0,
    status: decideStockSyncFinalStatus(hasMore, errorCount),
  };
}
