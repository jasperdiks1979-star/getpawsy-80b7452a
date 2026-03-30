/**
 * MERCHANT POLICY — Approved customer-facing strings and banned-term scanner.
 *
 * Every trust / shipping / returns string rendered on the storefront must be
 * imported from here (or from src/lib/shipping-constants.ts, which this
 * re-exports for convenience).
 *
 * NO hardcoded policy text is permitted in components.
 */

// Re-export all shipping constants as the canonical source
export {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_RATE,
  DELIVERY_TIME_STANDARD,
  DELIVERY_TIME_EXPRESS,
  DELIVERY_TIME_INTERNATIONAL,
  DELIVERY_DISCLAIMER,
  PROCESSING_TIME,
  SITE_LAST_UPDATED,
  US_FULFILLMENT_NOTE,
  RETURN_WINDOW_DAYS,
  RETURNS_POLICY_SHORT,
  RETURNS_POLICY_DETAILED,
  RETURNS_PROCESS,
  SUPPORT_EMAIL,
  INFO_EMAIL,
  RESPONSE_TIME,
  BUSINESS_HOURS,
  BUSINESS_LOCATION,
  BUSINESS_NAME,
  BUSINESS_OPERATOR,
  BUSINESS_REGISTRATION,
  BUSINESS_VAT_ID,
  BUSINESS_SERVICE_AREA,
  OPERATING_COUNTRY,
  TRUST_BADGES,
  ANNOUNCEMENT_FREE_SHIPPING,
  getCartShippingMessage,
  FLAT_RATE_MESSAGE,
  PRODUCT_SHIPPING_INFO,
  FAQ_SHIPPING_ANSWER,
  FAQ_RETURNS_ANSWER,
  FAQ_INTERNATIONAL_ANSWER,
  TIERED_INCENTIVES,
  getApplicableTier,
  getNextTier,
} from '@/lib/shipping-constants';

// ============= APPROVED MICROCOPY =============

/** Approved shipping microcopy for product cards / CTAs */
export const APPROVED_SHIPPING_LINE = 'Estimated delivery: 5–10 business days';

/** Approved free shipping line */
export const APPROVED_FREE_SHIPPING_LINE = 'Free US shipping on orders $35+';

/** Approved returns line */
export const APPROVED_RETURNS_LINE = '30-day returns';

/** Approved checkout trust line */
export const APPROVED_CHECKOUT_TRUST = 'Secure checkout powered by Stripe';

// ============= BANNED TERMS =============

/**
 * Terms that must NEVER appear in customer-facing product copy.
 * Used by the merchant-safe audit to flag policy-risk content.
 */
export const BANNED_TERMS = [
  'fast shipping',
  '3-7 days',
  '3–7 days',
  'overnight',
  'next day delivery',
  'same day',
  'guaranteed',
  'vet approved',
  'vet-approved',
  'veterinarian approved',
  'clinically proven',
  'clinically tested',
  'scientifically proven',
  'relieves pain',
  'cures',
  'heals',
  'treats disease',
  'FDA approved',
  'medical grade',
  'prescription',
  'doctor recommended',
] as const;

/**
 * Check a block of text for banned terms.
 * Returns the list of found violations.
 */
export function scanForBannedTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_TERMS.filter((term) => lower.includes(term.toLowerCase()));
}
