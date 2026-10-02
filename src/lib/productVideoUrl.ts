/**
 * Product video signed-URL helpers (storefront side).
 *
 * Product videos live in PRIVATE buckets. `product_media.storage_url` stores a
 * time-limited signed URL; some generators (cinematic-v3) sign for only 30
 * days, so stored links expire. The storefront re-signs on demand via the
 * `product-video-urls` function only when a stored link is expired or close
 * to expiry. Buckets stay private; no stored rows are modified.
 */

/** Re-sign when a stored link expires within this window. */
export const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;

/** Buckets the signer is allowed to re-sign (product video media only). */
export const SIGNABLE_VIDEO_BUCKETS = ['product-media', 'cinematic-v3'] as const;

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

/** Expiry (ms epoch) of a storage signed URL, or null if not a signed URL / unparsable. */
export function signedUrlExpiryMs(url: string | null | undefined): number | null {
  if (!url || !url.includes('/object/sign/')) return null;
  try {
    const token = new URL(url).searchParams.get('token');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const exp = JSON.parse(b64urlDecode(payload))?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when a stored signed URL is expired or expires within the renewal window. */
export function needsResign(url: string | null | undefined, now = Date.now()): boolean {
  const exp = signedUrlExpiryMs(url);
  if (exp === null) return false; // public/unknown URLs are used as-is
  return exp - now < RENEW_WITHIN_MS;
}
