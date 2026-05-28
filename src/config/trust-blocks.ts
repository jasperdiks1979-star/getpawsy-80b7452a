/**
 * Trust blocks configuration (CI-4, Part 8).
 *
 * Centralizes which trust modules appear on which surfaces, so they can be
 * toggled per-page without touching component code. No database table —
 * this lives in the bundle and ships statically.
 *
 * Pages opt in by key; consumers read the config and render accordingly.
 */

export type TrustModule =
  | 'free_shipping'
  | 'returns'
  | 'secure_checkout'
  | 'us_support'
  | 'small_business';

export type TrustSurface =
  | 'pdp_mobile_strip'
  | 'pdp_reassurance'
  | 'collection_block'
  | 'homepage_band';

const DEFAULT: Record<TrustSurface, TrustModule[]> = {
  pdp_mobile_strip: ['free_shipping', 'returns', 'secure_checkout'],
  pdp_reassurance: ['returns', 'us_support', 'secure_checkout'],
  collection_block: ['free_shipping', 'returns', 'secure_checkout', 'us_support'],
  homepage_band: ['free_shipping', 'returns', 'us_support'],
};

export function getTrustModules(surface: TrustSurface): TrustModule[] {
  return DEFAULT[surface] ?? [];
}

export const TRUST_LABELS: Record<TrustModule, string> = {
  free_shipping: 'Free shipping over $50',
  returns: '30-day returns',
  secure_checkout: 'Secure checkout',
  us_support: 'US-based support',
  small_business: 'Independent small business',
};