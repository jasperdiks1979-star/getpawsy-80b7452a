/**
 * Fail-closed release gate for legacy bundle upsell.
 *
 * The legacy FrequentlyBoughtTogether component drops selected variant IDs,
 * displays base prices for products whose purchasable variants cost more,
 * and applies a client-side discount before server-authoritative checkout.
 * Do not enable until variant identity, canonical pricing and checkout
 * discount parity pass a full isolated end-to-end test.
 * Ordinary single-product add-to-cart is unaffected.
 */
export function isBundleUpsellReady(): boolean {
  return false;
}
