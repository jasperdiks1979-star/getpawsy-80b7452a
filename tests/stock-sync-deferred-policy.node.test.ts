import { test } from "node:test";
import { strict as assert } from "node:assert";
import { assertDeferredCursorProgress, isDeferrableNoData } from "../supabase/functions/_shared/stock-sync-deferred-policy.ts";

test("only explicit CJ no_data without confirmed stock is deferrable", () => {
  assert.equal(isDeferrableNoData({status:"no_data",confirmed:false,stock:null}),true);
  for (const result of [
    {status:"no_data" as const,confirmed:true,stock:null},
    {status:"no_data" as const,confirmed:false,stock:0},
    {status:"error" as const,confirmed:false,stock:null},
    {status:"ok" as const,confirmed:true,stock:0},
    {status:"discontinued" as const,confirmed:true,stock:0},
  ]) assert.equal(isDeferrableNoData(result),false);
});

test("deferred cursor proof requires exactly one persisted step", () => {
  assert.equal(assertDeferredCursorProgress(284,285,773),285);
  assert.equal(assertDeferredCursorProgress(772,773,773),773);
  for (const [before,after,total] of [
    [284,284,773],[284,286,773],[284,null,773],[284,"285",773],
    [772,774,773],[-1,0,773],[0,1,0],[Number.NaN,1,773],
  ] as Array<[number,unknown,number]>) {
    assert.throws(() => assertDeferredCursorProgress(before,after,total));
  }
});
