/**
 * Coupon codes the storefront lets shoppers apply at checkout.
 * Every percent MUST equal COUPON_CODE_PERCENT in
 * supabase/functions/create-checkout/index.ts (the charging authority);
 * src/test/checkout-edge-cases.test.ts enforces this.
 */
export const STOREFRONT_COUPONS: Record<string, { discount: number; label: string }> = {
  WELCOME10: { discount: 10, label: 'Welcome 10% Off' },
  DONTGO15: { discount: 15, label: "Don't Go 15% Off" },
  // Promised by the slow-feeder lead magnet / offer page and stored for checkout.
  SLOWFEEDER25: { discount: 25, label: 'Slow Feeder 25% Off' },
};

export function normalizeCouponCode(code: string | null | undefined): string {
  return (code ?? '').toUpperCase().trim();
}
