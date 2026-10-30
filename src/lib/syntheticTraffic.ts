/**
 * Explicit synthetic-traffic contract. Do not infer bot status from short
 * sessions, desktop devices, cache-busting URLs or country: those are not proof.
 * Browser E2E tests set this marker before application scripts execute.
 * Keep the marker in sessionStorage so it survives SPA navigation and reloads,
 * but never leaks into a real visitor's other browser tabs.
 */
export const SYNTHETIC_TRAFFIC_KEY = 'gp_synthetic_traffic_v1';

export function isSyntheticTraffic(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
    return target?.getItem(SYNTHETIC_TRAFFIC_KEY) === 'playwright-e2e';
  } catch {
    return false;
  }
}
