/** Staged only: not imported by production until release gates pass. */
export const LIVE_STORE_ORIGIN = 'https://getpawsy.pet';

export function resolveCheckoutReturnOrigin(
  stripeMode: string,
  origin: string | null,
  referer: string | null,
  configuredBase: string | null,
): string {
  if (stripeMode === 'live') return LIVE_STORE_ORIGIN;
  if (stripeMode !== 'test') throw new Error('checkout_mode_unknown');
  for (const candidate of [origin, referer, configuredBase]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const preview = url.hostname.endsWith('.lovable.app') || url.hostname.endsWith('.lovable.dev');
      if (url.username || url.password) continue;
      if ((local && (url.protocol === 'http:' || url.protocol === 'https:')) ||
          (url.protocol === 'https:' && (preview || url.origin === LIVE_STORE_ORIGIN))) return url.origin;
    } catch { /* Malformed candidate must not control return URLs. */ }
  }
  return LIVE_STORE_ORIGIN;
}