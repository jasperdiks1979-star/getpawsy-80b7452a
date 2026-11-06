import { test } from "node:test";
import assert from "node:assert/strict";
import { assertVerifiedRecoveredProduct, assertPersistedStockSyncProgress } from "../supabase/functions/_shared/stock-sync-recovery-proof.ts";
import { assertPersistedDeferredStockSyncProgress } from "../supabase/functions/_shared/stock-sync-deferred-recovery-proof.ts";

const started = "2026-11-04T12:00:00.000Z";
const row = { id: "cj-1", stock: 0, stock_sync_status: "discontinued", stock_source: "CJ", last_stock_sync_at: started };
const progress = { last_offset: 1, total_products: 1, status: "needs_review", error_count: 1 };
const queue = { product_id: "cj-1", last_offset: 0, reason: "no_data", state: "pending", last_attempt_at: started };

test("confirmed discontinued zero is valid, but nonzero discontinued is rejected", () => {
  assert.equal(assertVerifiedRecoveredProduct(0, { last_offset: 1, status: "needs_review" }, "cj-1", row, started), 1);
  assert.throws(() => assertVerifiedRecoveredProduct(0, { last_offset: 1, status: "needs_review" }, "cj-1", { ...row, stock: 2 }, started));
});

test("fractional, negative and nonfinite recovery offsets are rejected", () => {
  for (const offset of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => assertPersistedStockSyncProgress(offset, { last_offset: 1, status: "running" }));
  }
});

test("deferred final cursor requires review, never completed", () => {
  assert.equal(assertPersistedDeferredStockSyncProgress(0, 0, row, progress, queue, row, started), 1);
  assert.throws(() => assertPersistedDeferredStockSyncProgress(0, 0, row, { ...progress, status: "completed" }, queue, row, started));
});

test("deferred stock proof rejects changed inventory and stale queue timestamps", () => {
  assert.throws(() => assertPersistedDeferredStockSyncProgress(0, 0, row, progress, queue, { ...row, stock: 1 }, started));
  assert.throws(() => assertPersistedDeferredStockSyncProgress(0, 0, row, progress, { ...queue, last_attempt_at: "2026-11-04T11:59:59.000Z" }, row, started));
});
