/** A deferred CJ no_data scan step is not a verified stock update.
 * Accept it only with an exact durable queue record and unchanged product stock.
 */
export interface DeferredQueueProof {
  product_id: string;
  last_offset: number;
  reason: string;
  state: string;
  last_attempt_at: string;
}
export interface DeferredProgressProof {
  last_offset: number;
  total_products: number;
  status: string;
  error_count: number;
}
export interface DeferredProductProof {
  id: string;
  stock: number | null;
  stock_sync_status: string | null;
  stock_source: string | null;
  last_stock_sync_at: string | null;
}
export function assertPersistedDeferredStockSyncProgress(
  beforeOffset: number,
  beforeErrors: number,
  beforeProduct: DeferredProductProof,
  after: DeferredProgressProof | null,
  queue: DeferredQueueProof | null,
  afterProduct: DeferredProductProof | null,
  startedAt: string,
): number {
  const startedMs = Date.parse(startedAt);
  const queuedMs = queue?.last_attempt_at ? Date.parse(queue.last_attempt_at) : NaN;
  if (!Number.isSafeInteger(beforeOffset) || beforeOffset < 0 ||
      !Number.isSafeInteger(beforeErrors) || beforeErrors < 0 ||
      !after || !Number.isSafeInteger(after.last_offset) ||
      !Number.isSafeInteger(after.total_products) ||
      !Number.isSafeInteger(after.error_count) ||
      after.last_offset !== beforeOffset + 1 ||
      after.last_offset > after.total_products ||
      after.error_count !== beforeErrors + 1 ||
      after.status !== (after.last_offset === after.total_products ? "needs_review" : "running") ||
      !queue || queue.product_id !== beforeProduct.id ||
      queue.last_offset !== beforeOffset ||
      queue.reason !== "no_data" ||
      !["pending", "exhausted"].includes(queue.state) ||
      !Number.isFinite(startedMs) || !Number.isFinite(queuedMs) ||
      queuedMs < startedMs ||
      !afterProduct || afterProduct.id !== beforeProduct.id ||
      afterProduct.stock !== beforeProduct.stock ||
      afterProduct.stock_sync_status !== beforeProduct.stock_sync_status ||
      afterProduct.stock_source !== beforeProduct.stock_source ||
      afterProduct.last_stock_sync_at !== beforeProduct.last_stock_sync_at) {
    throw new Error("Deferred recovery lacks exact durable queue and unchanged stock proof");
  }
  return after.last_offset;
}
