import { isAuthorizedStockSyncStatusRequest } from './stock-sync-auth.ts';

Deno.test('custom scheduler secret is disabled when unconfigured', () => {
  if (isAuthorizedStockSyncStatusRequest('x'.repeat(48), undefined, 'status')) throw new Error('unconfigured secret accepted');
});
Deno.test('custom scheduler secret requires high entropy length', () => {
  if (isAuthorizedStockSyncStatusRequest('short', 'short', 'status')) throw new Error('short secret accepted');
});
Deno.test('custom scheduler secret allows status only with exact match', () => {
  const token = 'a'.repeat(48);
  if (!isAuthorizedStockSyncStatusRequest(token, token, 'status')) throw new Error('valid status rejected');
  if (isAuthorizedStockSyncStatusRequest('b'.repeat(48), token, 'status')) throw new Error('invalid secret accepted');
});
Deno.test('custom scheduler secret cannot authorize any write or debug action', () => {
  const token = 'a'.repeat(48);
  for (const action of ['sync-batch', 'resume', 'reset', 'watchdog-once', 'deferred-retry-once', 'debug', '']) {
    if (isAuthorizedStockSyncStatusRequest(token, token, action)) throw new Error('forbidden action accepted: ' + action);
  }
});
