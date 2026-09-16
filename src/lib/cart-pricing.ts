/**
 * CANONICAL CART PRICING ENGINE (Commerce N).
 *
 * ONE contract for every surface that shows or charges money:
 *   PDP bundle selector → cart → checkout → Stripe line items.
 *
 * All arithmetic is done in integer cents so the number rendered to the
 * shopper is byte-identical to the amount Stripe is asked to charge.
 *
 * MIRROR: supabase/functions/_shared/pricing-engine.ts
 * The two files MUST stay behaviourally identical — `src/test/commerce-n.test.ts`
 * proves it by running both engines over the same matrix of carts.
 */

export const FREE_SHIPPING_THRESHOLD_CENTS = 3500;
export const FLAT_SHIPPING_RATE_CENTS = 599;

/** A percentage discount is a VOLUME reward: it needs 2+ units, always. */
export const VOLUME_DISCOUNT_MIN_UNITS = 2;

export interface PricingTier {
  thresholdCents: number;
  percent: number;
  label: string;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  { thresholdCents: 3500, percent: 0, label: 'Free Shipping' },
  { thresholdCents: 6500, percent: 5, label: '5% Off Your Order' },
  { thresholdCents: 9900, percent: 10, label: '10% Off Your Order' },
] as const;

export const toCents = (amount: number): number => Math.round(amount * 100);

/** Highest tier actually earned by this cart. Null when nothing is earned. */
export function earnedTier(subtotalCents: number, unitCount: number): PricingTier | null {
  const volumeOk = unitCount >= VOLUME_DISCOUNT_MIN_UNITS;
  let found: PricingTier | null = null;
  for (const tier of PRICING_TIERS) {
    if (subtotalCents < tier.thresholdCents) continue;
    if (tier.percent > 0 && !volumeOk) continue;
    found = tier;
  }
  return found;
}

/** Canonical percentage discount for a cart. 0 when not eligible. */
export function tierPercentFor(subtotalCents: number, unitCount: number): number {
  return earnedTier(subtotalCents, unitCount)?.percent ?? 0;
}

export interface QuoteLine {
  unitPriceCents: number;
  quantity: number;
}

export interface CartQuote {
  unitCount: number;
  subtotalCents: number;
  tierPercent: number;
  tierDeductionCents: number;
  couponPercent: number;
  couponDeductionCents: number;
  totalDeductionCents: number;
  shippingCents: number;
  totalCents: number;
}

/**
 * The single settlement calculation. Everything else (badges, teasers,
 * Stripe coupons) is derived from this result — never recomputed ad hoc.
 */
export function computeCartQuote(
  lines: readonly QuoteLine[],
  options: { couponPercent?: number } = {},
): CartQuote {
  const unitCount = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotalCents = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);

  const tierPercent = tierPercentFor(subtotalCents, unitCount);
  const couponPercent = Math.max(0, Math.min(100, options.couponPercent ?? 0));

  const tierDeductionCents = Math.round((subtotalCents * tierPercent) / 100);
  const couponDeductionCents = Math.round((subtotalCents * couponPercent) / 100);
  const totalDeductionCents = Math.min(subtotalCents, tierDeductionCents + couponDeductionCents);

  const shippingCents =
    subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_RATE_CENTS;

  return {
    unitCount,
    subtotalCents,
    tierPercent,
    tierDeductionCents,
    couponPercent,
    couponDeductionCents,
    totalDeductionCents,
    shippingCents,
    totalCents: subtotalCents - totalDeductionCents + shippingCents,
  };
}

/** Convenience for PDP bundle tiles: quote for `quantity` of one unit price. */
export function quoteForBundle(unitPriceCents: number, quantity: number): CartQuote {
  return computeCartQuote([{ unitPriceCents, quantity }]);
}
