/** A successful HTTP response is not proof that supplier inventory progressed.
 * sync-stock persists its checkpoint before replying; a fresh DB read must advance.
 */
export function assertPersistedStockSyncProgress(
  before: number,
  after: { last_offset: number; status: string } | null,
): number {
  if (!Number.isSafeInteger(before) || before < 0 ||
      !after || !Number.isSafeInteger(after.last_offset) ||
      after.last_offset <= before ||
      !["running", "completed", "needs_review"].includes(after.status)) {
    throw new Error(`Recovery did not persist forward progress from checkpoint ${before}`);
  }
  return after.last_offset;
}

/** A checkpoint increase alone is insufficient: older sync code advanced
 * offsets for CJ no_data. The watchdog must independently verify that the
 * exact product at the previous offset received fresh, CJ-confirmed stock.\n * A final needs_review checkpoint can still prove THIS batch when older\n * deferred CJ checks remain unresolved; it is never all-stock verified.
 */
export interface VerifiedStockRecoveryRow {
  id: string;
  stock: number | null;
  stock_sync_status: string | null;
  stock_source: string | null;
  last_stock_sync_at: string | null;
}

export function assertVerifiedRecoveredProduct(
  before: number,
  after: { last_offset: number; status: string } | null,
  expectedProductId: string,
  product: VerifiedStockRecoveryRow | null,
  recoveryStartedAt: string,
): number {
  const offset = assertPersistedStockSyncProgress(before, after);
  // The production sync currently processes exactly one product per batch.
  if (offset !== before + 1) {
    throw new Error("Recovery checkpoint jumped more than one product");
  }
  const startedMs = Date.parse(recoveryStartedAt);
  const checkedMs = product?.last_stock_sync_at ? Date.parse(product.last_stock_sync_at) : NaN;
  if (!Number.isFinite(startedMs) || !Number.isFinite(checkedMs) ||
      checkedMs < startedMs || !product || product.id !== expectedProductId ||
      (product.stock_sync_status !== "ok" && product.stock_sync_status !== "discontinued") ||
      product.stock_source !== "CJ" ||
      !Number.isSafeInteger(product.stock) || product.stock! < 0 ||
      (product.stock_sync_status === "discontinued" && product.stock !== 0)) {
    throw new Error("Recovery did not persist fresh verified CJ stock for the expected product");
  }
  return offset;
}
