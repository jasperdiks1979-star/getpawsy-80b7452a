/**
 * Trust labels are disabled.
 *
 * The previous implementation assigned rotating social-proof labels
 * ("Bestseller", "In high demand", "Pet owner favorite", ...) based on a hash
 * of the product ID. Those claims are not backed by verifiable data and are
 * not permitted under Google Merchant Center's misrepresentation policy.
 *
 * The function is kept so existing call sites keep compiling; it always
 * returns an empty string and call sites render nothing.
 */
export function getTrustLabel(_productId: string, _index: number): string {
  return '';
}
