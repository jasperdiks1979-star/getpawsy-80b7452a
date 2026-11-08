import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWatchdogSingleBatchOffset,
  shouldContinueStockSync,
} from "../supabase/functions/_shared/stock-sync-auth.ts";

const partial = { last_offset: 284, total_products: 773, status: "running" };

test("watchdog resumes exactly its leased checkpoint", () => {
  assert.equal(resolveWatchdogSingleBatchOffset(true, "watchdog-once", 284, partial), 284);
});
test("watchdog cannot be called by an authenticated admin without service role", () => {
  assert.throws(() => resolveWatchdogSingleBatchOffset(false, "watchdog-once", 284, partial));
});
test("watchdog refuses a moved checkpoint (race with cron)", () => {
  assert.throws(() => resolveWatchdogSingleBatchOffset(true, "watchdog-once", 284, { ...partial, last_offset: 285 }));
});
test("watchdog refuses a zero-offset reset", () => {
  assert.throws(() => resolveWatchdogSingleBatchOffset(true, "watchdog-once", 0, partial));
});
test("watchdog refuses skipped, negative, fractional and non-finite offsets", () => {
  for (const offset of [283, 285, -1, 284.5, NaN, Infinity]) {
    assert.throws(() => resolveWatchdogSingleBatchOffset(true, "watchdog-once", offset, partial));
  }
});
test("watchdog refuses completed and final needs_review runs", () => {
  for (const status of ["completed", "needs_review", "idle"]) {
    assert.throws(() => resolveWatchdogSingleBatchOffset(true, "watchdog-once", 284, { ...partial, status }));
  }
});
test("watchdog refuses last product already scanned", () => {
  assert.throws(() => resolveWatchdogSingleBatchOffset(true, "watchdog-once", 773, { ...partial, last_offset: 773 }));
});
test("watchdog never launches a background continuation even with service key", () => {
  assert.equal(shouldContinueStockSync(true, false, "watchdog-once"), false);
  assert.equal(shouldContinueStockSync(false, true, "watchdog-once"), false);
});
test("existing service cron and admin resume continue to work", () => {
  assert.equal(shouldContinueStockSync(true, false, "sync-batch"), true);
  assert.equal(shouldContinueStockSync(false, true, "resume"), true);
  assert.equal(shouldContinueStockSync(false, false, "resume"), false);
});
test("ordinary sync actions do not invoke watchdog checkpoint policy", () => {
  assert.equal(resolveWatchdogSingleBatchOffset(false, "sync-batch", 0, partial), null);
});
