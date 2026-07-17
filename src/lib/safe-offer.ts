/**
 * Safe Offer Builder for Product JSON-LD
 *
 * Google Search Console flags Product schema where `offers.price` is missing,
 * zero, or non-numeric. To prevent this, never emit an `offers` object unless
 * the product has a real, positive numeric price.
 *
 * Usage:
 *   const offer = buildSafeOffer(product);
 *   const item = { '@type': 'Product', name, image, ...(offer && { offers: offer }) };
 *
 * For ItemList entries, drop the entire item if no offer is available:
 *   .map((p) => buildSafeProductListItem(p, position))
 *   .filter(Boolean)
 */

export interface SafeOfferInput {
  price?: number | string | null;
  stock?: number | null;
  status?: string | null;
  slug?: string | null;
  id?: string;
}

import { buildStructuredProductName } from "./structured-product-name";

const BASE = 'https://getpawsy.pet';

/**
 * Returns a valid Schema.org Offer object, or null if the product has no
 * usable price. Callers MUST handle the null case.
 */
export function buildSafeOffer(
  product: SafeOfferInput,
  baseUrl: string = BASE
): Record<string, unknown> | null {
  const numeric = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
  if (typeof numeric !== 'number' || !isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const productPath = product.slug || product.id;
  const inStock = (product.stock ?? 1) > 0 || product.status === 'active';

  return {
    '@type': 'Offer',
    ...(productPath ? { url: `${baseUrl}/products/${productPath}` } : {}),
    price: numeric.toFixed(2),
    priceCurrency: 'USD',
    availability: inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
  };
}

/**
 * Returns a Product entry suitable for ItemList.itemListElement, or null
 * when the product cannot produce a valid offer. Filter nulls before use.
 */
export function buildSafeProductListItem(
  product: SafeOfferInput & {
    name: string;
    name_clean?: string | null;
    image_url?: string | null;
    images?: (string | null)[] | null;
  },
  position: number,
  baseUrl: string = BASE
): Record<string, unknown> | null {
  const offer = buildSafeOffer(product, baseUrl);
  if (!offer) return null;

  const productPath = product.slug || product.id;
  const image = product.image_url || product.images?.find(Boolean) || undefined;

  return {
    '@type': 'ListItem',
    position,
    item: {
      '@type': 'Product',
      '@id': `${baseUrl}/products/${productPath}`,
      name: buildStructuredProductName(product),
      ...(image ? { image } : {}),
      offers: offer,
    },
  };
}
