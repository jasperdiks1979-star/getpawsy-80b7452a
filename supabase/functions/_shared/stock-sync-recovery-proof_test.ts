import { assertPersistedStockSyncProgress, assertVerifiedRecoveredProduct, type VerifiedStockRecoveryRow } from "./stock-sync-recovery-proof.ts";

Deno.test("recovery proof requires a persisted checkpoint increase", () => {
  const current = 229;
  if (assertPersistedStockSyncProgress(current, { last_offset: 230, status: "running" }) !== 230) {
    throw new Error("A valid resumed batch must be accepted");
  }
  if (assertPersistedStockSyncProgress(772, { last_offset: 773, status: "completed" }) !== 773) {
    throw new Error("Completed final batch must be accepted");
  }
  if (assertPersistedStockSyncProgress(772, { last_offset: 773, status: "needs_review" }) !== 773) {
    throw new Error("A final checkpoint with older deferred items must not be mistaken for no progress");
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

Deno.test("recovery proof requires the exact freshly verified CJ product", () => {
  const started = "2026-11-02T16:00:00.000Z";
  const valid: VerifiedStockRecoveryRow = {
    id: "p284", stock: 7, stock_sync_status: "ok", stock_source: "CJ",
    last_stock_sync_at: "2026-11-02T16:00:01.000Z",
  };
  if (assertVerifiedRecoveredProduct(284, { last_offset: 285, status: "running" },
      "p284", valid, started) !== 285) {
    throw new Error("Verified stock update must prove one batch of progress");
  }
  if (assertVerifiedRecoveredProduct(772, { last_offset: 773, status: "completed" },
      "p284", { ...valid, stock: 0, stock_sync_status: "discontinued" }, started) !== 773) {
    throw new Error("CJ-confirmed discontinued zero must be valid");
  }
  if (assertVerifiedRecoveredProduct(772, { last_offset: 773, status: "needs_review" },
      "p284", valid, started) !== 773) {
    throw new Error("Fresh CJ stock must prove this final batch even if earlier deferrals remain");
  }
  let rejectedUnverifiedFinal = false;
  try {
    assertVerifiedRecoveredProduct(772, { last_offset: 773, status: "needs_review" },
      "p284", { ...valid, stock_sync_status: "no_data" }, started);
  } catch { rejectedUnverifiedFinal = true; }
  if (!rejectedUnverifiedFinal) throw new Error("Deferred no_data must never count as verified final stock");
  const invalid: Array<[string, VerifiedStockRecoveryRow | null]> = [
    ["no_data", { ...valid, stock_sync_status: "no_data" }],
    ["error", { ...valid, stock_sync_status: "error" }],
    ["stale", { ...valid, last_stock_sync_at: "2026-11-01T12:00:00.000Z" }],
    ["bad date", { ...valid, last_stock_sync_at: "not-a-date" }],
    ["no date", { ...valid, last_stock_sync_at: null }],
    ["wrong id", { ...valid, id: "p285" }],
    ["wrong source", { ...valid, stock_source: "manual" }],
    ["missing stock", { ...valid, stock: null }],
    ["negative stock", { ...valid, stock: -1 }],
    ["discontinued nonzero", { ...valid, stock_sync_status: "discontinued" }],
    ["missing row", null],
  ];
  for (const [name, row] of invalid) {
    let rejected = false;
    try {
      assertVerifiedRecoveredProduct(284, { last_offset: 285, status: "running" },
        "p284", row, started);
    } catch { rejected = true; }
    if (!rejected) throw new Error(`Accepted invalid recovery proof: ${name}`);
  }
  for (const offset of [284, 286]) {
    let rejected = false;
    try {
      assertVerifiedRecoveredProduct(284, { last_offset: offset, status: "running" },
        "p284", valid, started);
    } catch { rejected = true; }
    if (!rejected) throw new Error(`Accepted invalid offset ${offset}`);
  }
});
