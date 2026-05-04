/**
 * Pinterest API configuration.
 *
 * Mode is controlled by the `PINTEREST_MODE` env secret:
 *   - "sandbox"    → https://api-sandbox.pinterest.com  (Trial / Evaluation access)
 *   - "production" → https://api.pinterest.com          (full production access)
 *
 * While the app is in Trial / Evaluation access, production /v5/pins
 * returns: "Apps with Trial access may not create Pins in production".
 * Default to sandbox until PINTEREST_MODE=production is explicitly set.
 */
export type PinterestMode = "sandbox" | "production";

export function getPinterestMode(): PinterestMode {
  const raw = (Deno.env.get("PINTEREST_MODE") || "sandbox").toLowerCase().trim();
  return raw === "production" ? "production" : "sandbox";
}

export function getPinterestApiBase(): string {
  return getPinterestMode() === "production"
    ? "https://api.pinterest.com"
    : "https://api-sandbox.pinterest.com";
}

/**
 * Backwards-compatible export. Resolves at import time using the current
 * PINTEREST_MODE secret. Existing call sites using `${PINTEREST_API_BASE}/v5/...`
 * keep working unchanged.
 */
export const PINTEREST_API_BASE = getPinterestApiBase();
