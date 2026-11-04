export interface DeferredClaim { product_id: string; cj_product_id: string; token: string }
export interface DeferredWorkerIO {
 claim(): Promise<DeferredClaim | null>;
 observe(cjId: string): Promise<Record<string, unknown>>;
 finish(claim: DeferredClaim, result: Record<string, unknown>): Promise<boolean>;
}
/** Exactly one durable claim per invocation; no recursion or local retry loop. */
export async function runDeferredStockWorker(io: DeferredWorkerIO) {
 const claim = await io.claim();
 if (!claim) return { claimed: false, verified: false };
 let result: Record<string, unknown>;
 try { result = await io.observe(claim.cj_product_id); }
 catch { result = { confirmed: false, status: 'error', message: 'Supplier request failed; bounded retry scheduled' }; }
 const persisted = await io.finish(claim, result);
 if (!persisted) throw new Error('Deferred claim expired or superseded');
 return { claimed: true, verified: result.confirmed === true && Number.isSafeInteger(result.stock) && Number(result.stock) >= 0 && ['US', 'EU', 'CN', 'none'].includes(String(result.warehouse)) && (result.status === 'ok' || (result.status === 'discontinued' && result.stock === 0)), product_id: claim.product_id };
}
