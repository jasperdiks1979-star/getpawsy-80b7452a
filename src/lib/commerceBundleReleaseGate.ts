/**
 * Release gate for the PDP "Complete the setup" bundle (FrequentlyBoughtTogether).
 * Fail-closed: the bundle adds the base products.price and drops the selected
 * variant identity, so it can disagree with the PDP/checkout price
 * (e.g. $96.99 base vs $97.95 charged variant). Keep false until the bundle
 * carries exact variant ids and customerUnitPrice parity is proven by tests.
 */
export function isBundleUpsellReady(): boolean {
  return false;
}
