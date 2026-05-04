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
 * Single source of truth for Pinterest mode:
 *   1. `pinterest_runtime_settings.mode` row (admin-controlled, hot-swappable)
 *   2. fallback to `PINTEREST_MODE` env secret
 *   3. fallback to "sandbox"
 *
 * A 403 response from the production API auto-flips runtime mode back to
 * sandbox via `markProductionForbidden()`.
 */

let _cachedMode: PinterestMode | null = null;
let _cachedAt = 0;
const CACHE_MS = 30_000;

function envMode(): PinterestMode {
  const raw = (Deno.env.get("PINTEREST_MODE") || "sandbox").toLowerCase().trim();
  return raw === "production" ? "production" : "sandbox";
}

export async function getPinterestMode(sb?: any): Promise<PinterestMode> {
  if (_cachedMode && Date.now() - _cachedAt < CACHE_MS) return _cachedMode;
  if (sb) {
    try {
      const { data } = await sb
        .from("pinterest_runtime_settings")
        .select("mode")
        .eq("id", 1)
        .maybeSingle();
      if (data?.mode === "sandbox" || data?.mode === "production") {
        _cachedMode = data.mode;
        _cachedAt = Date.now();
        return _cachedMode;
      }
    } catch {
      // ignore — fall back to env
    }
  }
  _cachedMode = envMode();
  _cachedAt = Date.now();
  return _cachedMode;
}

export function apiBaseFor(mode: PinterestMode): string {
  return mode === "production"
    ? "https://api.pinterest.com/v5"
    : "https://api-sandbox.pinterest.com/v5";
}

export async function getPinterestApiBase(sb?: any): Promise<string> {
  return apiBaseFor(await getPinterestMode(sb));
}

/**
 * Sync, env-only base. Used by utility helpers (board listing, OAuth token
 * exchange) where we don't have a Supabase client handy. Publish paths must
 * use the async `getPinterestApiBase(sb)` to honor runtime mode + fallback.
 */
export const PINTEREST_API_BASE = apiBaseFor(envMode());

/** Auto-fallback: 403 from production → flip runtime to sandbox */
export async function markProductionForbidden(sb: any, reason = "production not allowed, fallback active"): Promise<void> {
  try {
    await sb.from("pinterest_runtime_settings").update({
      mode: "sandbox",
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    _cachedMode = "sandbox";
    _cachedAt = Date.now();
    console.warn(`[pinterest-config] ${reason}`);
    await sb.from("pinterest_post_logs").insert({
      action: "mode_fallback",
      status: "warning",
      error_message: reason,
    });
  } catch (e) {
    console.error("[pinterest-config] fallback failed:", e);
  }
}
