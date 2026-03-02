/**
 * Centralized shipping and returns constants
 * 
 * IMPORTANT: All shipping-related text across the site MUST use these constants
 * to ensure consistency. Never hardcode shipping values in components.
 * 
 * Target Market: United States
 * Last Updated: 2025-01-31
 */

// ============= SHIPPING CONSTANTS =============

/** Free shipping threshold in USD */
export const FREE_SHIPPING_THRESHOLD = 49;

// ============= TIERED INCENTIVE THRESHOLDS =============

/** Tiered discount configuration – applied automatically in cart */
export const TIERED_INCENTIVES = [
  { threshold: 49, label: 'Free Shipping', discountPercent: 0 },
  { threshold: 79, label: '5% Off Your Order', discountPercent: 5 },
  { threshold: 119, label: '10% Off Your Order', discountPercent: 10 },
] as const;

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

/** Flat shipping rate for orders under threshold in USD */
export const FLAT_SHIPPING_RATE = 5.99;

/** Standard delivery time for US orders */
export const DELIVERY_TIME_STANDARD = '3-7 business days';

/** Processing time before shipping */
export const PROCESSING_TIME = '1-3 business days';

/** US fulfillment shipping note - Official wording for Google Merchant Center compliance */
export const US_FULFILLMENT_NOTE = 'Orders ship from US fulfillment centers when available';

/** Express shipping time (if available) */
export const DELIVERY_TIME_EXPRESS = '2-5 business days';

/** International delivery time */
export const DELIVERY_TIME_INTERNATIONAL = '10-20 business days';

// ============= RETURNS CONSTANTS =============

/** Return window in days */
export const RETURN_WINDOW_DAYS = 30;

/** Returns policy short description */
export const RETURNS_POLICY_SHORT = '30-day hassle-free returns';

/** Returns policy detailed */
export const RETURNS_POLICY_DETAILED = 'Not satisfied? Return within 30 days for a full refund.';

/** How to initiate returns */
export const RETURNS_PROCESS = 'Contact support@getpawsy.pet with your order number and photos of any issues.';

// ============= SUPPORT CONSTANTS =============

/** Support email */
export const SUPPORT_EMAIL = 'support@getpawsy.pet';

/** Response time promise */
export const RESPONSE_TIME = 'We respond within 24 business hours';

/** Business name */
export const BUSINESS_NAME = 'GetPawsy';

/** Operating country display */
export const OPERATING_COUNTRY = 'Netherlands (serving US customers)';

// ============= TRUST BADGE MESSAGES =============

export const TRUST_BADGES = {
  shipping: {
    title: 'Free US Shipping',
    subtitle: `On orders over $${FREE_SHIPPING_THRESHOLD}`,
  },
  delivery: {
    title: 'Fast Delivery',
    subtitle: DELIVERY_TIME_STANDARD,
  },
  returns: {
    title: `${RETURN_WINDOW_DAYS}-Day Returns`,
    subtitle: 'Hassle-free returns',
  },
  secure: {
    title: 'Secure Checkout',
    subtitle: 'Powered by Stripe',
  },
  quality: {
    title: 'Quality Guarantee',
    subtitle: '100% satisfaction',
  },
} as const;

// ============= FORMATTED MESSAGES =============

/** Free shipping announcement bar message */
export const ANNOUNCEMENT_FREE_SHIPPING = `🚚 FREE shipping on orders over $${FREE_SHIPPING_THRESHOLD}!`;

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
  freeShipping: `Free US shipping on orders $${FREE_SHIPPING_THRESHOLD}+`,
  deliveryTime: `Estimated delivery: ${DELIVERY_TIME_STANDARD}`,
  usFulfillment: US_FULFILLMENT_NOTE,
  returns: RETURNS_POLICY_SHORT,
};

// ============= SEO/FAQ SHIPPING TEXT =============

export const FAQ_SHIPPING_ANSWER = `We offer free US shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Orders under $${FREE_SHIPPING_THRESHOLD} ship for a flat rate of $${FLAT_SHIPPING_RATE.toFixed(2)}. Standard delivery takes ${DELIVERY_TIME_STANDARD}. Orders ship from US fulfillment centers when available.`;

export const FAQ_RETURNS_ANSWER = `We offer a ${RETURN_WINDOW_DAYS}-day money-back guarantee on all products. If you're not satisfied, contact us at ${SUPPORT_EMAIL} with your order number for a hassle-free return.`;

export const FAQ_INTERNATIONAL_ANSWER = 'We primarily serve US customers with fast domestic shipping. International orders may have longer delivery times (10-20 business days) and may be subject to customs fees.';
