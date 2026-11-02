/** A scan is not verified complete while any deferred or failed CJ stock check remains. */
export type StockSyncFinalStatus = 'running' | 'completed' | 'needs_review';

export function decideStockSyncFinalStatus(hasMore: boolean, errorCount: number): StockSyncFinalStatus {
  if (!Number.isSafeInteger(errorCount) || errorCount < 0) {
    throw new Error('Invalid stock sync error count');
  }
  if (hasMore) return 'running';
  return errorCount === 0 ? 'completed' : 'needs_review';
}
