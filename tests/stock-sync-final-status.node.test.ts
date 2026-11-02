import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideStockSyncFinalStatus, decideStockSyncBatchOutcome } from '../supabase/functions/_shared/stock-sync-final-status.ts';

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

test('a successful recovered product remains batch-successful after earlier deferred no_data', () => {
  const outcome = decideStockSyncBatchOutcome(true, 1, 0);
  assert.deepEqual(outcome, { success: true, allVerified: false, status: 'running' });
});

test('final scan cannot claim all verified while deferred items remain', () => {
  const outcome = decideStockSyncBatchOutcome(false, 2, 0);
  assert.deepEqual(outcome, { success: true, allVerified: false, status: 'needs_review' });
});

test('new batch errors are not reported as successful', () => {
  assert.deepEqual(decideStockSyncBatchOutcome(true, 0, 1),
    { success: false, allVerified: false, status: 'running' });
});

test('batch error arithmetic fails closed', () => {
  for (const values of [[-1, 0], [0, -1], [Number.MAX_SAFE_INTEGER, 1], [NaN, 0]]) {
    assert.throws(() => decideStockSyncBatchOutcome(true, values[0], values[1]));
  }
});
