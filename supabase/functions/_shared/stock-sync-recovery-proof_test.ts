import { assertPersistedStockSyncProgress } from "./stock-sync-recovery-proof.ts";

Deno.test("recovery proof requires a persisted checkpoint increase", () => {
  const current = 229;
  if (assertPersistedStockSyncProgress(current, { last_offset: 230, status: "running" }) !== 230) {
    throw new Error("A valid resumed batch must be accepted");
  }
  if (assertPersistedStockSyncProgress(772, { last_offset: 773, status: "completed" }) !== 773) {
    throw new Error("Completed final batch must be accepted");
  }
  const invalid = [
    null,
    { last_offset: 229, status: "running" },
    { last_offset: 228, status: "running" },
    { last_offset: 230, status: "idle" },
    { last_offset: Number.NaN, status: "running" },
  ];
  for (const after of invalid) {
    let rejected = false;
    try { assertPersistedStockSyncProgress(current, after); } catch { rejected = true; }
    if (!rejected) throw new Error(`Unverified recovery accepted: ${JSON.stringify(after)}`);
  }
});


Deno.test("exhausted retries are a hard block, never a green no-op", async () => {
  const { isStockSyncRecoveryRetryExhausted } = await import("./stock-sync-recovery-proof.ts");
  const progress = { last_offset: 284, status: "running" };
  if (!isStockSyncRecoveryRetryExhausted(284, progress, { checkpoint: 284, attempts: 3 })) {
    throw new Error("Three exhausted retries at unchanged checkpoint must escalate");
  }
  const benign = [
    { expected: 284, progress, lease: { checkpoint: 284, attempts: 2 } },
    { expected: 284, progress, lease: { checkpoint: 283, attempts: 3 } },
    { expected: 284, progress: { last_offset: 285, status: "running" }, lease: { checkpoint: 284, attempts: 3 } },
    { expected: 284, progress: { last_offset: 284, status: "completed" }, lease: { checkpoint: 284, attempts: 3 } },
    { expected: 284, progress, lease: null },
    { expected: -1, progress, lease: { checkpoint: 284, attempts: 3 } },
    { expected: 284, progress, lease: { checkpoint: 284, attempts: Number.NaN } },
  ];
  for (const c of benign) {
    if (isStockSyncRecoveryRetryExhausted(c.expected, c.progress, c.lease)) {
      throw new Error("Non-exhausted or raced recovery incorrectly escalated");
    }
  }
});
