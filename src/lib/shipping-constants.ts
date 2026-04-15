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
export const FREE_SHIPPING_THRESHOLD = 35;

// ============= TIERED INCENTIVE THRESHOLDS =============

/** Tiered discount configuration – applied automatically in cart */
export const TIERED_INCENTIVES = [
  { threshold: 35, label: 'Free Shipping', discountPercent: 0 },
  { threshold: 65, label: '5% Off Your Order', discountPercent: 5 },
  { threshold: 99, label: '10% Off Your Order', discountPercent: 10 },
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
export const DELIVERY_TIME_STANDARD = '5–10 business days';

/** Delivery disclaimer for compliance */
export const DELIVERY_DISCLAIMER = 'Delivery times may vary depending on location';

/** Processing time before shipping */
export const PROCESSING_TIME = '1–2 business days';

/** Sitewide trust freshness timestamp */
export const SITE_LAST_UPDATED = 'April 15, 2026';

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
export const BUSINESS_HOURS = 'Monday – Friday, 09:00 – 17:00 CET (03:00 – 11:00 AM ET)';

/** Business location */
export const BUSINESS_LOCATION = 'New York, NY · United States';

/** Business name */
export const BUSINESS_NAME = 'GetPawsy';

/** Legal operator name */
export const BUSINESS_OPERATOR = 'GetPawsy LLC';

/** Business registration */
export const BUSINESS_REGISTRATION = 'GetPawsy LLC';

/** Business VAT ID */
export const BUSINESS_VAT_ID = '';

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
