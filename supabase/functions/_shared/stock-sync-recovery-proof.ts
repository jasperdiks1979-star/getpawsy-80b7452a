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
      !["running", "completed"].includes(after.status)) {
    throw new Error(`Recovery did not persist forward progress from checkpoint ${before}`);
  }
  return after.last_offset;
}


/** A denied lease is normally harmless (another worker or backoff), but after
 * three failed attempts at the SAME persisted checkpoint it is a permanent
 * operational block. Never call that state a successful idle recovery.
 * Re-reading progress protects against a concurrent worker advancing the run.
 */
export function isStockSyncRecoveryRetryExhausted(
  expectedOffset: number,
  persisted: { last_offset: number; status: string } | null,
  lease: { checkpoint: number; attempts: number } | null,
): boolean {
  return Number.isSafeInteger(expectedOffset) && expectedOffset > 0 &&
    persisted?.status === "running" && persisted.last_offset === expectedOffset &&
    lease !== null && Number.isSafeInteger(lease.checkpoint) &&
    lease.checkpoint === expectedOffset &&
    Number.isSafeInteger(lease.attempts) && lease.attempts >= 3;
}
