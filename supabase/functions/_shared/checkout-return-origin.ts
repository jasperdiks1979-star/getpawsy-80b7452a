/**
 * Determine Stripe-hosted Checkout return URLs without trusting caller-supplied
 * Origin/Referer in LIVE mode. The Edge Function has wildcard CORS because it
 * is used from storefront clients; headers are not authorization.
 *
 * Live always returns the canonical GetPawsy domain. A request originating
 * from localhost or an arbitrary website must never configure a live Stripe
 * payment's success/cancel URL to that caller's host.
 *
 * Test mode can return to the local/sandbox storefront for verification.
 */
export const LIVE_STORE_ORIGIN = "https://getpawsy.pet";

export function resolveCheckoutReturnOrigin(
  stripeMode: string,
  origin: string | null,
  referer: string | null,
  configuredBase: string | null,
): string {
  if (stripeMode !== "test") return LIVE_STORE_ORIGIN;

  for (const candidate of [origin, referer, configuredBase]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol === "https:" || (url.protocol === "http:" && localHost)) {
        return url.origin;
      }
    } catch { /* Invalid header: use the next trusted candidate. */ }
  }
  return LIVE_STORE_ORIGIN;
}
