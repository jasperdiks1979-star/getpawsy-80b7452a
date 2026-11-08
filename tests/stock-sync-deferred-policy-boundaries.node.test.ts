import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeferrableNoData, assertDeferredCursorProgress } from "../supabase/functions/_shared/stock-sync-deferred-policy.ts";

test("only unconfirmed null no_data can enter deferred queue", () => {
  assert.equal(isDeferrableNoData({ status: "no_data", confirmed: false, stock: null }), true);
  for (const observation of [
    { status: "ok", confirmed: true, stock: 0 },
    { status: "discontinued", confirmed: true, stock: 0 },
    { status: "error", confirmed: false, stock: null },
    { status: "no_data", confirmed: true, stock: null },
    { status: "no_data", confirmed: false, stock: 0 },
    { status: "no_data", confirmed: false, stock: 7 },
  ] as const) {
    assert.equal(isDeferrableNoData(observation), false);
  }
});

test("deferred cursor must advance exactly one persisted step", () => {
  assert.equal(assertDeferredCursorProgress(317, 318, 773), 318);
  assert.equal(assertDeferredCursorProgress(772, 773, 773), 773);
  for (const persisted of [317, 319, 774, null, "318", NaN, Infinity, 318.5]) {
    assert.throws(() => assertDeferredCursorProgress(317, persisted, 773));
  }
});

test("invalid scan boundaries cannot be accepted as progress", () => {
  for (const [previous, persisted, total] of [
    [-1, 0, 773], [0.5, 1.5, 773], [773, 774, 773],
    [0, 1, 0], [0, 1, -1], [0, 1, 0.5],
  ]) {
    assert.throws(() => assertDeferredCursorProgress(previous, persisted, total));
  }
});
