// Pinterest Credit Forecasting — rolling burn-rate, depletion, emergency mode.
//
// Computed from `pinterest_credit_events.credits_used` over the trailing 7d
// window and the latest `credits_balance_initial` snapshot stored on
// `pinterest_credit_state`. Pure DB read + state update — never blocks the
// publish pipeline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ForecastState = "green" | "orange" | "red";

export interface ForecastSnapshot {
  credits_balance_initial: number | null;
  credits_used_since_set: number;
  credits_remaining: number | null;
  avg_credits_per_creative: number | null;
  daily_burn_rate: number | null;
  estimated_creatives_remaining: number | null;
  estimated_hours_remaining: number | null;
  estimated_days_remaining: number | null;
  estimated_depletion_at: string | null;
  forecast_state: ForecastState;
  emergency_mode: boolean;
  emergency_creative_threshold: number;
}

/**
 * Recompute forecast from the events log + the current balance snapshot.
 * Writes the result back to pinterest_credit_state (id=1).
 */
export async function recomputeForecast(
  supabase: SupabaseClient,
): Promise<ForecastSnapshot> {
  const { data: state } = await supabase
    .from("pinterest_credit_state")
    .select(
      "credits_balance_initial, credits_balance_set_at, credits_used_since_set, " +
      "emergency_creative_threshold, paused, manual_pause",
    )
    .eq("id", 1)
    .maybeSingle();

  const balanceInitial: number | null =
    state?.credits_balance_initial != null ? Number(state.credits_balance_initial) : null;
  const balanceSetAt: string | null = state?.credits_balance_set_at ?? null;
  const threshold: number = state?.emergency_creative_threshold ?? 20;

  // Sum credits_used since the balance was set (or all-time if not set).
  const sinceIso = balanceSetAt ?? new Date(0).toISOString();
  const { data: usedRows } = await supabase
    .from("pinterest_credit_events")
    .select("credits_used")
    .eq("event_type", "success")
    .gte("created_at", sinceIso)
    .not("credits_used", "is", null);
  const usedSinceSet = (usedRows ?? []).reduce(
    (s, r: any) => s + Number(r.credits_used ?? 0),
    0,
  );

  // Rolling 7d window for burn-rate + avg-per-creative.
  const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: weekRows } = await supabase
    .from("pinterest_credit_events")
    .select("credits_used, pin_queue_id")
    .eq("event_type", "success")
    .gte("created_at", sevenAgo);
  const weekCredits = (weekRows ?? []).reduce(
    (s, r: any) => s + Number(r.credits_used ?? 0),
    0,
  );
  const distinctPins = new Set<string>();
  for (const r of weekRows ?? []) {
    if ((r as any).pin_queue_id) distinctPins.add((r as any).pin_queue_id);
  }

  // Fallback: count drafts created in last 7d if events don't carry pin_queue_id.
  let creativesIn7d = distinctPins.size;
  if (creativesIn7d === 0) {
    const { count } = await supabase
      .from("pinterest_pin_queue")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenAgo);
    creativesIn7d = count ?? 0;
  }

  const dailyBurn = weekCredits > 0 ? weekCredits / 7 : null;
  const avgPerCreative =
    creativesIn7d > 0 && weekCredits > 0 ? weekCredits / creativesIn7d : null;

  const creditsRemaining =
    balanceInitial != null ? Math.max(0, balanceInitial - usedSinceSet) : null;

  let creativesRemaining: number | null = null;
  let hoursRemaining: number | null = null;
  let daysRemaining: number | null = null;
  let depletionAt: string | null = null;

  if (creditsRemaining != null && avgPerCreative && avgPerCreative > 0) {
    creativesRemaining = Math.floor(creditsRemaining / avgPerCreative);
  }
  if (creditsRemaining != null && dailyBurn && dailyBurn > 0) {
    daysRemaining = creditsRemaining / dailyBurn;
    hoursRemaining = daysRemaining * 24;
    depletionAt = new Date(Date.now() + hoursRemaining * 3600 * 1000).toISOString();
  }

  let forecastState: ForecastState = "green";
  if (state?.paused || state?.manual_pause) {
    forecastState = "red";
  } else if (daysRemaining != null) {
    if (daysRemaining < 1) forecastState = "red";
    else if (daysRemaining < 7) forecastState = "orange";
    else forecastState = "green";
  }

  const emergency =
    creativesRemaining != null && creativesRemaining < threshold;

  const patch = {
    credits_used_since_set: usedSinceSet,
    credits_remaining: creditsRemaining,
    avg_credits_per_creative: avgPerCreative,
    daily_burn_rate: dailyBurn,
    estimated_creatives_remaining: creativesRemaining,
    estimated_hours_remaining: hoursRemaining,
    estimated_days_remaining: daysRemaining,
    estimated_depletion_at: depletionAt,
    forecast_state: forecastState,
    emergency_mode: emergency,
    forecast_updated_at: new Date().toISOString(),
  };
  await supabase.from("pinterest_credit_state").update(patch).eq("id", 1);

  return {
    credits_balance_initial: balanceInitial,
    credits_used_since_set: usedSinceSet,
    credits_remaining: creditsRemaining,
    avg_credits_per_creative: avgPerCreative,
    daily_burn_rate: dailyBurn,
    estimated_creatives_remaining: creativesRemaining,
    estimated_hours_remaining: hoursRemaining,
    estimated_days_remaining: daysRemaining,
    estimated_depletion_at: depletionAt,
    forecast_state: forecastState,
    emergency_mode: emergency,
    emergency_creative_threshold: threshold,
  };
}

/**
 * Fire a critical monitoring alert + warning event when estimated depletion is
 * < 24h. 12h cooldown so we don't spam. Returns true if an alert was fired.
 */
export async function maybeFire24hAlert(
  supabase: SupabaseClient,
  snap: ForecastSnapshot,
): Promise<boolean> {
  if (snap.estimated_hours_remaining == null) return false;
  if (snap.estimated_hours_remaining >= 24) return false;

  const { data: state } = await supabase
    .from("pinterest_credit_state")
    .select("last_24h_alert_sent_at, alert_recipient_email")
    .eq("id", 1)
    .maybeSingle();

  const last = state?.last_24h_alert_sent_at
    ? new Date(state.last_24h_alert_sent_at).getTime()
    : 0;
  if (Date.now() - last < 12 * 60 * 60 * 1000) return false;

  const message =
    `Estimated credit exhaustion within 24 hours. ` +
    `Remaining: ${snap.credits_remaining?.toFixed(0) ?? "?"} credits ` +
    `(~${snap.estimated_creatives_remaining ?? "?"} creatives, ` +
    `~${snap.estimated_hours_remaining.toFixed(1)}h).`;

  await supabase.from("pinterest_credit_events").insert({
    event_type: "warning",
    message,
  });
  try {
    await supabase.from("monitoring_alerts").insert({
      alert_type: "pinterest_credits_24h_warning",
      severity: "critical",
      title: "Pinterest credits depleting in <24h",
      message,
      metadata: snap as any,
    });
  } catch (_) { /* ignore */ }

  // Attempt transactional email if recipient configured + template registered.
  const recipient = state?.alert_recipient_email;
  if (recipient) {
    try {
      await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-transactional-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            templateName: "pinterest-credit-24h-warning",
            recipientEmail: recipient,
            idempotencyKey: `pinterest-credit-24h-${new Date().toISOString().slice(0, 13)}`,
            templateData: {
              creditsRemaining: snap.credits_remaining,
              creativesRemaining: snap.estimated_creatives_remaining,
              hoursRemaining: snap.estimated_hours_remaining,
              depletionAt: snap.estimated_depletion_at,
            },
          }),
        },
      );
    } catch (_) { /* template may not be registered; alert row still fires */ }
  }

  await supabase
    .from("pinterest_credit_state")
    .update({ last_24h_alert_sent_at: new Date().toISOString() })
    .eq("id", 1);
  return true;
}

/**
 * Category priority order for emergency-mode throttling. Lower index = higher
 * priority. Returns a numeric score so callers can sort/filter.
 */
const PRIORITY_PATTERNS: Array<{ score: number; pattern: RegExp }> = [
  { score: 100, pattern: /self.?clean.*litter|smart.*litter/i },
  { score: 90, pattern: /cat.?tree/i },
  { score: 80, pattern: /interactive.*cat.*toy|cat.*interactive.*toy/i },
  { score: 70, pattern: /dog.*(puzzle|enrichment).*toy/i },
  { score: 60, pattern: /cat.?furniture/i },
];

export function categoryPriorityScore(
  key: string | null | undefined,
): number {
  if (!key) return 10;
  for (const { score, pattern } of PRIORITY_PATTERNS) {
    if (pattern.test(key)) return score;
  }
  return 10;
}

export function isHighPriorityCategory(
  key: string | null | undefined,
): boolean {
  return categoryPriorityScore(key) >= 60;
}