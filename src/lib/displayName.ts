/**
 * Prefer the AI-sanitized US-shopper headline (`name_clean`) over the raw
 * supplier name when present. Falls back to original `name` for products
 * that haven't been processed yet. Keep this as the single source of truth
 * for any user-facing product label (PDP H1, cards, cart, Stripe line items
 * via DB, Pinterest pin overlays, SEO metadata).
 */
import { neutralProductCopy } from './product-claim-hygiene';

export function displayName(product: { name?: string | null; name_clean?: string | null }): string {
  const clean = product?.name_clean?.trim();
  if (clean && clean.length > 0) return neutralProductCopy(clean);
  return neutralProductCopy(product?.name ?? "");
}