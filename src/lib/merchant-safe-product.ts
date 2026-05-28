/**
 * MERCHANT-SAFE PRODUCT LAYER
 *
 * Single source of truth for ALL customer-facing product display data.
 * Every card, PDP, sticky CTA, JSON-LD schema, OG tag, and feed payload
 * MUST derive display values through this module.
 *
 * No component may compute its own price, discount, or availability inline.
 */

import { PRICING_DISPLAY_MODE, ALLOW_VARIANT_PRICE_OVERRIDE } from '@/config/pricing-policy';
import {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  RETURN_WINDOW_DAYS,
} from '@/lib/shipping-constants';
import { computeAvailability } from '@/lib/availability';

// ============= TYPES =============

export interface MerchantProduct {
  id: string;
  name: string;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  price: number;
  compare_at_price?: number | null;
  stock?: number | null;
  is_active?: boolean | null;
  variants?: unknown;
  sku?: string | null;
  weight?: number | null;
}

export interface DisplayPriceResult {
  /** The canonical display price */
  price: number;
  /** Compare-at / was-price, or null */
  compareAtPrice: number | null;
  /** Formatted display string e.g. "$268.99" */
  displayPrice: string;
  /** Formatted compare-at string, or null */
  displayCompareAt: string | null;
}

export interface DisplayDiscount {
  /** Whole-number percentage e.g. 22, or null */
  percent: number | null;
  /** Dollar savings, or null */
  savings: number | null;
}

export interface DisplayAvailability {
  isInStock: boolean;
  label: string;
  schemaValue: string;
}

export interface CanonicalProductPayload {
  id: string;
  name: string;
  slug: string;
  url: string;
  price: DisplayPriceResult;
  discount: DisplayDiscount;
  availability: DisplayAvailability;
  shippingText: string;
  returnsText: string;
  imageUrl: string;
  images: string[];
  category: string;
  sku: string;
  currency: 'USD';
}

// ============= CORE HELPERS =============

/**
 * Get the canonical display price for any product surface.
 * Obeys the global PRICING_DISPLAY_MODE from pricing-policy.ts.
 */
export function getDisplayPrice(product: MerchantProduct): DisplayPriceResult {
  let price: number;

  if (PRICING_DISPLAY_MODE === 'base_price') {
    price = Number(product.price) || 0;
  } else {
    // default_variant_price mode
    const firstVariantPrice = extractFirstVariantPrice(product.variants);
    price = firstVariantPrice ?? (Number(product.price) || 0);
  }

  const compareAt = Number(product.compare_at_price) || 0;
  const validCompareAt = compareAt > price ? compareAt : null;

  return {
    price,
    compareAtPrice: validCompareAt,
    displayPrice: `$${price.toFixed(2)}`,
    displayCompareAt: validCompareAt ? `$${validCompareAt.toFixed(2)}` : null,
  };
}

/**
 * Get the canonical discount for any product surface.
 * Always computed from the display price (not variant-specific).
 */
export function getDisplayDiscount(product: MerchantProduct): DisplayDiscount {
  const { price, compareAtPrice } = getDisplayPrice(product);

  if (!compareAtPrice || compareAtPrice <= price || price <= 0) {
    return { percent: null, savings: null };
  }

  return {
    percent: Math.round((1 - price / compareAtPrice) * 100),
    savings: Math.round((compareAtPrice - price) * 100) / 100,
  };
}

/**
 * Get canonical availability.
 */
export function getDisplayAvailability(product: MerchantProduct): DisplayAvailability {
  const avail = computeAvailability(product);
  return {
    isInStock: avail.isInStock,
    label: avail.isInStock ? 'In Stock' : 'Out of Stock',
    schemaValue: avail.isInStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
  };
}

/**
 * Get canonical shipping text.
 */
export function getDisplayShippingText(product: MerchantProduct): string {
  const { price } = getDisplayPrice(product);
  if (price >= FREE_SHIPPING_THRESHOLD) {
    return `Free shipping available • Estimated delivery: ${DELIVERY_TIME_STANDARD}`;
  }
  return `$${FLAT_SHIPPING_RATE.toFixed(2)} shipping • Estimated delivery: ${DELIVERY_TIME_STANDARD}`;
}

/**
 * Get canonical returns text.
 */
export function getDisplayReturnsText(): string {
  return `${RETURN_WINDOW_DAYS}-day returns`;
}

/**
 * Build a complete canonical product payload.
 * Suitable for JSON-LD, OG tags, feed comparison, and audit scripts.
 */
export function getCanonicalProductPayload(
  product: MerchantProduct,
  baseUrl = 'https://getpawsy.pet',
): CanonicalProductPayload {
  const priceResult = getDisplayPrice(product);
  const discount = getDisplayDiscount(product);
  const availability = getDisplayAvailability(product);
  const shippingText = getDisplayShippingText(product);
  const returnsText = getDisplayReturnsText();
  const slug = product.slug || product.id;
  const images = (product.images?.filter(Boolean) as string[]) || [];
  const imageUrl = images[0] || product.image_url || '';

  return {
    id: product.id,
    name: product.name,
    slug,
    url: `${baseUrl}/products/${slug}`,
    price: priceResult,
    discount,
    availability,
    shippingText,
    returnsText,
    imageUrl,
    images: images.length > 0 ? images : imageUrl ? [imageUrl] : [],
    category: product.category || 'Pet Supplies',
    sku: product.sku || product.id,
    currency: 'USD',
  };
}

/**
 * Whether variant price override is allowed on PDP after explicit user selection.
 */
export function isVariantPriceOverrideAllowed(): boolean {
  return ALLOW_VARIANT_PRICE_OVERRIDE;
}

// ============= INTERNAL =============

function extractFirstVariantPrice(variants: unknown): number | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const first = variants[0];
  if (typeof first === 'object' && first !== null) {
    const sell = (first as Record<string, unknown>).variantSellPrice;
    if (sell !== undefined && sell !== null) {
      const n = Number(sell);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}
