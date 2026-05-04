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

/**
 * HARD OVERRIDE: while the Pinterest app is on Trial / Evaluation access,
 * we force sandbox regardless of the PINTEREST_MODE secret. Set this to
 * `false` only after Pinterest grants production approval.
 */
export const PINTEREST_FORCE_SANDBOX = true;

export function getPinterestMode(): PinterestMode {
  if (PINTEREST_FORCE_SANDBOX) return "sandbox";
  const raw = (Deno.env.get("PINTEREST_MODE") || "sandbox").toLowerCase().trim();
  return raw === "production" ? "production" : "sandbox";
}

export function getPinterestApiBase(): string {
  // Sandbox is hard-forced above; production branch only reachable when
  // PINTEREST_FORCE_SANDBOX is flipped to false AND PINTEREST_MODE=production.
  if (getPinterestMode() === "sandbox") {
    return "https://api-sandbox.pinterest.com";
  }
  return "https://api.pinterest.com";
}

/**
 * Backwards-compatible export. Resolves at import time using the current
 * PINTEREST_MODE secret. Existing call sites using `${PINTEREST_API_BASE}/v5/...`
 * keep working unchanged.
 */
export const PINTEREST_API_BASE = getPinterestApiBase();
