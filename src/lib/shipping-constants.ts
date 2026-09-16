/**
 * Centralized shipping and returns constants
 * 
 * IMPORTANT: All shipping-related text across the site MUST use these constants
 * to ensure consistency. Never hardcode shipping values in components.
 * 
 * Target Market: United States
 * Last Updated: 2025-01-31
 */

import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  PRICING_TIERS,
  VOLUME_DISCOUNT_MIN_UNITS as ENGINE_MIN_UNITS,
  tierPercentFor,
  toCents,
} from '@/lib/cart-pricing';

// ============= SHIPPING CONSTANTS =============

/** Free shipping threshold in USD */
export const FREE_SHIPPING_THRESHOLD = FREE_SHIPPING_THRESHOLD_CENTS / 100;

// ============= TIERED INCENTIVE THRESHOLDS =============
// Derived from the CANONICAL pricing engine (src/lib/cart-pricing.ts) so the
// cart UI can never drift from the amount charged.

/** Tiered discount configuration – applied automatically in cart */
export const TIERED_INCENTIVES = PRICING_TIERS.map((t) => ({
  threshold: t.thresholdCents / 100,
  label: t.label,
  discountPercent: t.percent,
}));


/** Get the best applicable tier for a given subtotal */
export const getApplicableTier = (subtotal: number) => {
  // Return the highest qualifying tier
  for (let i = TIERED_INCENTIVES.length - 1; i >= 0; i--) {
    if (subtotal >= TIERED_INCENTIVES[i].threshold) {
      return TIERED_INCENTIVES[i];
    }
  }
  return null;
};

/** Get the next tier the customer can unlock */
export const getNextTier = (subtotal: number) => {
  for (const tier of TIERED_INCENTIVES) {
    if (subtotal < tier.threshold) {
      return { ...tier, remaining: tier.threshold - subtotal };
    }
  }
  return null;
};

// ============= CANONICAL CART INCENTIVE RULES =============
// Single source of truth shared by Cart, Checkout and the incentive bar.
// Mirrors the server guard in supabase/functions/create-checkout/index.ts.
//
//   Free shipping        : subtotal >= FREE_SHIPPING_THRESHOLD (any unit count)
//   Percentage discount  : VOLUME reward — requires 2+ units, then
//                          subtotal >= 65 -> 5%, subtotal >= 99 -> 10%

/** Minimum total unit quantity required for any percentage (volume) discount */
export const VOLUME_DISCOUNT_MIN_UNITS = 2;

/** True when the cart holds enough units to earn a percentage volume discount */
export const qualifiesForVolumeDiscount = (unitCount: number): boolean =>
  unitCount >= VOLUME_DISCOUNT_MIN_UNITS;

/** Canonical tier percentage for a cart. Returns 0 when not eligible. */
export const getTierDiscountPercent = (subtotal: number, unitCount: number): number => {
  if (!qualifiesForVolumeDiscount(unitCount)) return 0;
  return getApplicableTier(subtotal)?.discountPercent ?? 0;
};

export interface CartIncentiveState {
  volumeEligible: boolean;
  freeShippingUnlocked: boolean;
  freeShippingRemaining: number;
  /** Highest tier actually earned (respects the unit-count rule) */
  currentTier: { threshold: number; label: string; discountPercent: number } | null;
  discountPercent: number;
  /** Next tier reachable by spending more, if any */
  nextTier:
    | { threshold: number; label: string; discountPercent: number; remaining: number; requiresMoreUnits: boolean }
    | null;
  /** Tier already reached by spend but locked purely by unit count */
  pendingVolumeTier: { threshold: number; label: string; discountPercent: number } | null;
  unitsNeededForVolume: number;
  allRewardsUnlocked: boolean;
}

/** Everything the cart UI needs, derived from the same rules as the charge. */
export const getCartIncentiveState = (subtotal: number, unitCount: number): CartIncentiveState => {
  const volumeEligible = qualifiesForVolumeDiscount(unitCount);
  const isUnlocked = (t: { threshold: number; discountPercent: number }) =>
    subtotal >= t.threshold && (t.discountPercent === 0 || volumeEligible);

  const unlocked = TIERED_INCENTIVES.filter(isUnlocked);
  const currentTier = unlocked.length ? { ...unlocked[unlocked.length - 1] } : null;

  const nextSpendTier = TIERED_INCENTIVES.find((t) => subtotal < t.threshold);
  const nextTier = nextSpendTier
    ? {
        ...nextSpendTier,
        remaining: Math.max(0, nextSpendTier.threshold - subtotal),
        requiresMoreUnits: nextSpendTier.discountPercent > 0 && !volumeEligible,
      }
    : null;

  const spendReached = [...TIERED_INCENTIVES].reverse().find(
    (t) => subtotal >= t.threshold && t.discountPercent > 0,
  );
  const pendingVolumeTier = !volumeEligible && spendReached ? { ...spendReached } : null;

  return {
    volumeEligible,
    freeShippingUnlocked: subtotal >= FREE_SHIPPING_THRESHOLD,
    freeShippingRemaining: Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal),
    currentTier,
    discountPercent: currentTier?.discountPercent ?? 0,
    nextTier,
    pendingVolumeTier,
    unitsNeededForVolume: Math.max(0, VOLUME_DISCOUNT_MIN_UNITS - unitCount),
    allRewardsUnlocked: volumeEligible && !nextTier && !!currentTier,
  };
};

/** Flat shipping rate for orders under threshold in USD */
export const FLAT_SHIPPING_RATE = 5.99;

/** Standard delivery time for US orders */
export const DELIVERY_TIME_STANDARD = '5–10 business days';

/** Delivery disclaimer for compliance */
export const DELIVERY_DISCLAIMER = 'Delivery times may vary depending on location';

/** Processing time before shipping */
export const PROCESSING_TIME = '1–2 business days';

/** Sitewide trust freshness timestamp */
export const SITE_LAST_UPDATED = 'August 25, 2026';

/** US fulfillment shipping note - Official wording for Google Merchant Center compliance */
export const US_FULFILLMENT_NOTE = 'Orders ship directly to customers across the United States';

/** Express shipping time (if available) */
export const DELIVERY_TIME_EXPRESS = '2–4 business days';

/** International delivery time */
export const DELIVERY_TIME_INTERNATIONAL = '10-20 business days';

// ============= RETURNS CONSTANTS =============

/** Return window in days */
export const RETURN_WINDOW_DAYS = 30;

/** Returns policy short description */
export const RETURNS_POLICY_SHORT = '30-day returns';

/** Returns policy detailed */
export const RETURNS_POLICY_DETAILED = 'Return eligible items within 30 days according to our return policy.';

/** How to initiate returns */
export const RETURNS_PROCESS = 'Contact support@getpawsy.pet with your order number and photos of any issues.';

// ============= SUPPORT CONSTANTS =============

/** Primary support/contact email — used sitewide */
export const SUPPORT_EMAIL = 'support@getpawsy.pet';

/** General info email (alias, same as SUPPORT_EMAIL) */
export const INFO_EMAIL = 'support@getpawsy.pet';

/** Response time promise */
export const RESPONSE_TIME = 'We typically respond within 24 hours';

/** Business hours */
export const BUSINESS_HOURS = 'Monday – Friday, 9:00 AM – 5:00 PM ET';

/** Business location */
export const BUSINESS_LOCATION = 'Apeldoorn, Netherlands';

/** Business name */
export const BUSINESS_NAME = 'GetPawsy';

/** Legal operator name */
export const BUSINESS_OPERATOR = 'Skidzo';

/** Legal form of the merchant */
export const BUSINESS_LEGAL_FORM = 'Dutch sole proprietorship';

/** Dutch Chamber of Commerce number */
export const BUSINESS_KVK = '78156955';

/** Public VAT identification number */
export const BUSINESS_VAT_ID = 'NL003295015B69';

/** Canonical merchant identity statement (long form) */
export const MERCHANT_IDENTITY_STATEMENT =
  'GetPawsy is a trading name of Skidzo, a Dutch sole proprietorship registered in the Netherlands (KvK 78156955, VAT ID NL003295015B69), based in Apeldoorn, Netherlands. GetPawsy serves customers in the United States.';

/** Canonical merchant identity statement (short form) */
export const MERCHANT_IDENTITY_SHORT =
  'GetPawsy is a trading name of Skidzo, a Dutch sole proprietorship (KvK 78156955, VAT ID NL003295015B69) based in Apeldoorn, Netherlands, serving customers in the United States.';

/** Service area */
export const BUSINESS_SERVICE_AREA = 'Serving customers across the United States';

/** Operating country display */
export const OPERATING_COUNTRY = 'United States';

// ============= TRUST BADGE MESSAGES =============

export const TRUST_BADGES = {
  shipping: {
    title: 'Free Shipping Available',
    subtitle: `On orders over $${FREE_SHIPPING_THRESHOLD}`,
  },
  delivery: {
    title: 'US Delivery',
    subtitle: DELIVERY_TIME_STANDARD,
  },
  returns: {
    title: `${RETURN_WINDOW_DAYS}-Day Returns`,
    subtitle: 'Easy return process',
  },
  secure: {
    title: 'Secure Checkout',
    subtitle: 'Powered by Stripe',
  },
  quality: {
    title: 'Customer Support',
    subtitle: 'Response within 24 hours',
  },
} as const;

// ============= FORMATTED MESSAGES =============

/** Free shipping announcement bar message */
export const ANNOUNCEMENT_FREE_SHIPPING = `🚚 Free shipping on orders over $${FREE_SHIPPING_THRESHOLD} (${DELIVERY_TIME_STANDARD})`;

/** Cart free shipping progress message */
export const getCartShippingMessage = (currentTotal: number): string => {
  const remaining = FREE_SHIPPING_THRESHOLD - currentTotal;
  if (remaining <= 0) {
    return '🎉 You qualify for FREE shipping!';
  }
  return `Add $${remaining.toFixed(2)} more for FREE shipping!`;
};

/** Flat rate shipping message */
export const FLAT_RATE_MESSAGE = `Orders under $${FREE_SHIPPING_THRESHOLD} ship for a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}.`;

/** Product page shipping info */
export const PRODUCT_SHIPPING_INFO = {
  freeShipping: `Free shipping on eligible orders $${FREE_SHIPPING_THRESHOLD}+`,
  deliveryTime: `Estimated delivery: ${DELIVERY_TIME_STANDARD}`,
  usFulfillment: US_FULFILLMENT_NOTE,
  returns: RETURNS_POLICY_SHORT,
};

// ============= SEO/FAQ SHIPPING TEXT =============

export const FAQ_SHIPPING_ANSWER = `We offer free shipping on eligible orders over $${FREE_SHIPPING_THRESHOLD}. Orders under $${FREE_SHIPPING_THRESHOLD} ship for a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}. Standard delivery takes ${DELIVERY_TIME_STANDARD}. Orders ship directly to customers across the United States.`;

export const FAQ_RETURNS_ANSWER = `We offer a ${RETURN_WINDOW_DAYS}-day return window on eligible products. Contact us at ${SUPPORT_EMAIL} with your order number to start a return according to our return policy.`;

export const FAQ_INTERNATIONAL_ANSWER = 'We primarily serve US customers with fast domestic shipping. International orders may have longer delivery times (10-20 business days) and may be subject to customs fees.';
