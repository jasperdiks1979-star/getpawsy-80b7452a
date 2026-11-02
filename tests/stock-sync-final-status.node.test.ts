import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideStockSyncFinalStatus } from '../supabase/functions/_shared/stock-sync-final-status.ts';

test('intermediate checkpoint stays running even after an error', () => {
  assert.equal(decideStockSyncFinalStatus(true, 1), 'running');
  assert.equal(decideStockSyncFinalStatus(true, 0), 'running');
});

test('terminal checkpoint with unresolved no_data is needs_review', () => {
  assert.equal(decideStockSyncFinalStatus(false, 1), 'needs_review');
  assert.equal(decideStockSyncFinalStatus(false, 3), 'needs_review');
});

test('terminal checkpoint without errors can complete', () => {
  assert.equal(decideStockSyncFinalStatus(false, 0), 'completed');
});

test('invalid error counts fail closed', () => {
  for (const value of [-1, 0.5, NaN, Infinity]) {
    assert.throws(() => decideStockSyncFinalStatus(false, value));
  }
});
