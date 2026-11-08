import { mayResetStockSyncCheckpoint } from './stock-sync-auth.ts';

Deno.test('stock checkpoint reset denies unauthenticated callers', () => {
  if (mayResetStockSyncCheckpoint(false) !== false) throw new Error('anonymous reset allowed');
});

Deno.test('stock checkpoint reset denies service-only scheduler callers', () => {
  const isAuthenticatedAdmin = false; // even when scheduler service authentication succeeded
  if (mayResetStockSyncCheckpoint(isAuthenticatedAdmin) !== false) throw new Error('scheduler reset allowed');
});

Deno.test('stock checkpoint reset permits verified admin', () => {
  if (mayResetStockSyncCheckpoint(true) !== true) throw new Error('verified admin denied');
});
