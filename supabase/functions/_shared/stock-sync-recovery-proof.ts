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
