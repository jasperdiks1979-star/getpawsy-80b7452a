/**
 * PRICING POLICY — Single source of truth for storefront pricing strategy.
 *
 * This config determines HOW prices are displayed across every customer-facing
 * surface: cards, PDPs, sticky CTAs, JSON-LD, OG tags, and feeds.
 *
 * Changing the mode here changes the entire storefront in one place.
 *
 * @see src/lib/merchant-safe-product.ts — canonical helpers that obey this policy
 */

export type PricingDisplayMode = 'base_price' | 'default_variant_price';

/**
 * Active pricing policy for the storefront.
 *
 * - "base_price"             → always use product.price everywhere
 * - "default_variant_price"  → use the deterministic first variant sell price
 *                               (falls back to product.price when no variants exist)
 */
export const PRICING_DISPLAY_MODE: PricingDisplayMode = 'base_price';

/**
 * When true, variant selection on PDP can override the display price.
 * When false, even explicit variant clicks will not change the visible price
 * (useful during GMC reviews to guarantee 100 % match).
 */
export const ALLOW_VARIANT_PRICE_OVERRIDE = true;
