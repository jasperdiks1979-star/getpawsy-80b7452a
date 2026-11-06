import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPersistedStockSyncProgress, assertVerifiedRecoveredProduct } from '../supabase/functions/_shared/stock-sync-recovery-proof.ts';

const started = '2026-11-02T16:00:00.000Z';
const row = { id: 'p284', stock: 7, stock_sync_status: 'ok', stock_source: 'CJ', last_stock_sync_at: '2026-11-02T16:00:01.000Z' };

test('final needs_review checkpoint is forward progress', () =>
  assert.equal(assertPersistedStockSyncProgress(772, { last_offset: 773, status: 'needs_review' }), 773));
test('verified CJ last product is accepted despite earlier deferrals', () =>
  assert.equal(assertVerifiedRecoveredProduct(772, { last_offset: 773, status: 'needs_review' }, 'p284', row, started), 773));
test('unverified no_data is rejected even when needs_review', () =>
  assert.throws(() => assertVerifiedRecoveredProduct(772, { last_offset: 773, status: 'needs_review' }, 'p284', { ...row, stock_sync_status: 'no_data' }, started)));
test('stale CJ data is rejected', () =>
  assert.throws(() => assertVerifiedRecoveredProduct(772, { last_offset: 773, status: 'needs_review' }, 'p284', { ...row, last_stock_sync_at: '2026-11-02T15:00:00.000Z' }, started)));
test('replay checkpoint is rejected', () =>
  assert.throws(() => assertVerifiedRecoveredProduct(772, { last_offset: 772, status: 'needs_review' }, 'p284', row, started)));
test('skip checkpoint is rejected', () =>
  assert.throws(() => assertVerifiedRecoveredProduct(772, { last_offset: 774, status: 'needs_review' }, 'p284', row, started)));
test('unknown status is rejected', () =>
  assert.throws(() => assertPersistedStockSyncProgress(772, { last_offset: 773, status: 'idle' })));
