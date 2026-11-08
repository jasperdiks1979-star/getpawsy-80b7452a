import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPersistedDeferredStockSyncProgress } from '../supabase/functions/_shared/stock-sync-deferred-recovery-proof.ts';

const start = '2026-11-02T19:00:00Z';
const before = { id: 'p284', stock: 17, stock_sync_status: 'ok', stock_source: 'CJ', last_stock_sync_at: '2026-11-01T00:00:00Z' };
const after = { last_offset: 285, total_products: 773, status: 'running', error_count: 1 };
const queue = { product_id: 'p284', last_offset: 284, reason: 'no_data', state: 'pending', last_attempt_at: '2026-11-02T19:00:01Z' };
function verify(progress = after, deferred = queue, product = before, previous = before, previousOffset = 284, previousErrors = 0) {
  return assertPersistedDeferredStockSyncProgress(previousOffset, previousErrors, previous, progress, deferred, product, start);
}

test('accepts only persisted exact one-step no_data deferral, not verified stock', () => {
  assert.equal(verify(), 285);
  assert.equal(verify({ ...after, last_offset: 773, status: 'needs_review', total_products: 773 }, { ...queue, last_offset: 772 }, before, before, 772), 773);
  assert.equal(verify(after, { ...queue, state: 'exhausted' }), 285);
});

test('rejects false progress and non-atomic evidence', () => {
  const invalid = [
    () => verify({ ...after, last_offset: 284 }),
    () => verify({ ...after, last_offset: 286 }),
    () => verify({ ...after, error_count: 0 }),
    () => verify({ ...after, status: 'completed' }),
    () => verify({ ...after, total_products: 284 }),
    () => verify(after, { ...queue, product_id: 'other' }),
    () => verify(after, { ...queue, last_offset: 283 }),
    () => verify(after, { ...queue, reason: 'error' }),
    () => verify(after, { ...queue, state: 'resolved' }),
    () => verify(after, { ...queue, last_attempt_at: '2026-11-02T18:59:59Z' }),
    () => verify(after, { ...queue, last_attempt_at: 'invalid' }),
    () => verify(after, queue, { ...before, stock: 0 }),
    () => verify(after, queue, { ...before, stock_source: 'manual' }),
    () => verify(after, queue, { ...before, last_stock_sync_at: start }),
    () => verify(after, queue, { ...before, stock_sync_status: 'no_data' }),
  ];
  for (const scenario of invalid) assert.throws(scenario);
});
