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
