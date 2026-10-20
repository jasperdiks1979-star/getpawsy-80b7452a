/**
 * Guide → product link eligibility for hydrated guide pages.
 *
 * Stored guide content (picks, comparison rows, inline links) can point at
 * products that are still active but merch-blocked, hidden, out of stock or
 * off-topic legacy items. Only storefront-eligible slugs (same gates as the
 * homepage) may be linked; others are dropped/unlinked, keeping the copy.
 * `eligible === null` means the eligible set has not loaded yet → fail closed.
 */
const PRODUCT_HREF = /^\/products?\/([a-z0-9-]+)\/?(?:[?#].*)?$/i;

export function productSlugFromHref(href: string | undefined | null): string | null {
  const m = (href ?? '').match(PRODUCT_HREF);
  return m ? m[1].toLowerCase() : null;
}

/** True for non-product links; for product links only when the slug is eligible. */
export function isGuideLinkAllowed(href: string | undefined | null, eligible: ReadonlySet<string> | null): boolean {
  const slug = productSlugFromHref(href);
  if (!slug) return true;
  return !!eligible && eligible.has(slug);
}
