import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertVerifiedRecoveredProduct } from "../supabase/functions/_shared/stock-sync-recovery-proof.ts";

const started = "2026-11-02T16:00:00.000Z";
const verified = {
  id: "p284", stock: 7, stock_sync_status: "ok",
  stock_source: "CJ", last_stock_sync_at: "2026-11-02T16:00:01.000Z",
};

test("crash before checkpoint write cannot count as recovered", () => {
  assert.throws(() => assertVerifiedRecoveredProduct(284,
    { last_offset: 284, status: "running" }, "p284", verified, started));
});
test("replayed or skipped recovery cannot count as recovered", () => {
  for (const offset of [283, 284, 286]) {
    assert.throws(() => assertVerifiedRecoveredProduct(284,
      { last_offset: offset, status: "running" }, "p284", verified, started));
  }
});
test("CJ no_data cursor advancement is not verified stock", () => {
  assert.throws(() => assertVerifiedRecoveredProduct(284,
    { last_offset: 285, status: "running" }, "p284",
    { ...verified, stock_sync_status: "no_data" }, started));
});
test("stale, wrong-product and non-CJ writes cannot prove recovery", () => {
  for (const row of [
    { ...verified, last_stock_sync_at: "2026-11-02T15:59:59.000Z" },
    { ...verified, id: "p285" },
    { ...verified, stock_source: "manual" },
  ]) assert.throws(() => assertVerifiedRecoveredProduct(284,
    { last_offset: 285, status: "running" }, "p284", row, started));
});
test("fresh confirmed CJ stock at exactly next checkpoint proves recovery", () => {
  assert.equal(assertVerifiedRecoveredProduct(284,
    { last_offset: 285, status: "running" }, "p284", verified, started), 285);
});
