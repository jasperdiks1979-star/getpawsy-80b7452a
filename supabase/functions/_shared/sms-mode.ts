// ─────────────────────────────────────────────────────────────────────────────
// sms-mode.ts
// Centralized "SMS Mode" gate for owner Twilio alerts.
//
// Modes:
//   - "sales_only"            (production default) — ONLY paid-order SMS
//   - "sales_plus_critical"   — paid-order SMS + a small allow-list of
//                               critical operational alerts
//   - "all"                   — everything (debug / staging only)
//
// Source of truth: public.app_config row { key: 'sms_mode' }.
//
// Manual admin actions (test / replay) always send regardless of mode —
// they are explicit human triggers from /admin/sms-alerts.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SBClient = any;

export type SmsMode = "sales_only" | "sales_plus_critical" | "all";

export const SMS_MODE_DEFAULT: SmsMode = "sales_only";

/** Alert types that represent real paid sales — never gated. */
export const SALES_ALERT_TYPES = new Set<string>([
  "order",
  "paid_order",
  "replay", // admin replay of a real paid order
]);

/** Alert types considered "critical" — sent only in sales_plus_critical or all. */
export const CRITICAL_ALERT_TYPES = new Set<string>([
  "stripe_webhook_down",
  "payment_failure_spike",
]);

/** Manual admin-triggered alert types — bypass the mode gate. */
export const MANUAL_ALERT_TYPES = new Set<string>([
  "test",
  "manual",
]);

export async function getSmsMode(supabase: SBClient): Promise<SmsMode> {
  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "sms_mode")
      .maybeSingle();
    const raw = (data?.value as unknown) ?? null;
    const v = typeof raw === "string" ? raw : (raw as { mode?: string } | null)?.mode;
    if (v === "sales_only" || v === "sales_plus_critical" || v === "all") return v;
    return SMS_MODE_DEFAULT;
  } catch (_) {
    return SMS_MODE_DEFAULT;
  }
}

export async function setSmsMode(supabase: SBClient, mode: SmsMode): Promise<void> {
  await supabase
    .from("app_config")
    .upsert(
      { key: "sms_mode", value: mode, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

/**
 * Returns true if the given alert type may be sent under the active mode.
 * Manual triggers always pass. Sales alerts always pass.
 */
export function canSendAlertType(mode: SmsMode, alertType: string): boolean {
  const t = (alertType || "").toLowerCase();
  if (MANUAL_ALERT_TYPES.has(t)) return true;
  if (SALES_ALERT_TYPES.has(t)) return true;
  if (mode === "all") return true;
  if (mode === "sales_plus_critical") return CRITICAL_ALERT_TYPES.has(t);
  // sales_only
  return false;
}

/**
 * Convenience: gate + best-effort log a blocked send into sms_alert_logs so
 * admins can still see attempts on /admin/sms-alerts without any SMS firing.
 */
export async function gateAndLog(
  supabase: SBClient,
  alertType: string,
  body: string,
  extra: Record<string, unknown> = {},
): Promise<{ allowed: boolean; mode: SmsMode }> {
  const mode = await getSmsMode(supabase);
  const allowed = canSendAlertType(mode, alertType);
  if (!allowed) {
    try {
      await supabase.from("sms_alert_logs").insert({
        alert_type: alertType,
        status: "blocked_by_mode",
        body: body.slice(0, 240),
        error_reason: `sms_mode=${mode}`,
        ...extra,
      });
    } catch (_) { /* logging only */ }
    console.log(`[SMS-MODE] blocked alert_type=${alertType} mode=${mode}`);
  }
  return { allowed, mode };
}