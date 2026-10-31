import { assertStockSyncBatchOffset } from "./stock-sync-progress.ts";

Deno.test("stock sync resumes only at the saved checkpoint", () => {
  assertStockSyncBatchOffset(211, { last_offset: 211, status: "running" });
  // An explicit resume resolves to the stored offset, never to zero.
  assertStockSyncBatchOffset(0, { last_offset: 0, status: "idle" });
  assertStockSyncBatchOffset(0, { last_offset: 0, status: "running" });
  assertStockSyncBatchOffset(0, { last_offset: 773, status: "completed" });
});

Deno.test("stock sync rejects replayed, skipped, completed and invalid offsets", () => {
  const invalid: Array<[number, number, string]> = [
    [0, 211, "running"], // regression: default admin sync-batch must not reset an active run
    [210, 211, "running"],
    [212, 211, "running"],
    [211, 211, "completed"],
    [-1, 211, "running"],
    [1.5, 211, "running"],
    [Number.NaN, 211, "running"],
  ];
  for (const [requested, saved, status] of invalid) {
    let rejected = false;
    try {
      assertStockSyncBatchOffset(requested, { last_offset: saved, status });
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(`Unsafe batch accepted: requested=${requested} saved=${saved} status=${status}`);
    }
  }
});
