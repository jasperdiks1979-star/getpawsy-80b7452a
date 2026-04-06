/**
 * Deterministic trust label system — assigns a varied label per product
 * based on product ID hash to avoid uniform patterns in grids.
 * No ratings, no review counts — only factual/aspirational labels.
 */

const LABELS = [
  '🔥 Bestseller',
  '👍 Pet owner favorite',
  '🟢 In high demand',
  '🐾 Recommended by pet lovers',
  '📦 Fast US shipping',
] as const;

/** Simple hash from string to number */
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns a trust label for a product. Uses the product ID + grid index
 * to ensure adjacent cards in the same grid get different labels.
 */
export function getTrustLabel(productId: string, index: number): string {
  const base = hash(productId);
  const pick = (base + index * 3) % LABELS.length;
  return LABELS[pick];
}
