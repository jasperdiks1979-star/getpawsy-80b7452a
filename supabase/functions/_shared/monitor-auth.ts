/**
 * Scheduled-monitor authorization.
 *
 * Read-only monitoring functions (analytics-health-probe,
 * visitor-map-stabilization-monitor) are driven by pg_cron, which cannot read
 * Deno env secrets. The established pattern in this project — already used by
 * analytics-canonical-warmer — is that cron reads a shared secret from the
 * private `internal_config` schema and sends it as `x-internal-secret`.
 *
 * This helper accepts that same warmer secret IN ADDITION to the normal
 * internal/admin guard, and nothing else. It is deliberately NOT part of
 * `requireInternalOrAdmin`, so the wider set of guarded admin/commerce
 * functions keeps the single, narrower internal secret.
 */
import { requireInternalOrAdmin } from "./admin-guard.ts";

const WARMER_SECRET = Deno.env.get("ANALYTICS_WARMER_SECRET") ?? "";

export async function requireMonitorCaller(req: Request): Promise<Response | null> {
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (WARMER_SECRET && provided && provided === WARMER_SECRET) return null;
  return await requireInternalOrAdmin(req);
}
