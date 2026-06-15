// Pinterest Credit Status — dashboard data endpoint.
// Returns: credit state, paused flag, open regen jobs, draft/queue counts,
// last successful publish time, pins published today/last hour, recent events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recomputeForecast } from "../_shared/pinterest-credit-forecast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // Always recompute on read so the dashboard reflects the latest signals.
  try { await recomputeForecast(supabase); } catch { /* tolerate */ }

  const [
    stateRes,
    openRegen,
    draftCount,
    queueCount,
    publishedToday,
    publishedLastHour,
    lastPublishedRow,
    recentEvents,
  ] = await Promise.all([
    supabase.from("pinterest_credit_state").select("*").eq("id", 1).maybeSingle(),
    supabase.from("ai_priority_queue").select("id", { count: "exact", head: true })
      .eq("status", "open").eq("source_kind", "pinterest_creative_regen"),
    supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("updated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("pinterest_pin_queue").select("id", { count: "exact", head: true })
      .eq("status", "posted")
      .gte("updated_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()),
    supabase.from("pinterest_pin_queue").select("updated_at, pinterest_pin_id, board_name, product_slug")
      .eq("status", "posted").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("pinterest_credit_events").select("*")
      .order("created_at", { ascending: false }).limit(20),
  ]);

  const state = stateRes.data ?? {
    state: "green",
    paused: false,
    last_success_at: null,
    last_402_at: null,
    recent_success_count_1h: 0,
    recent_402_count_1h: 0,
    consecutive_402_count: 0,
  } as any;

  // Heuristic estimate: without a live balance API, we infer "capacity" from
  // recent success/failure ratio. 100% when nothing has failed in last hour,
  // 0% when paused. Otherwise scale by success share.
  const succ = state.recent_success_count_1h ?? 0;
  const fail = state.recent_402_count_1h ?? 0;
  let estimatedCreditsPct: number;
  if (state.paused) estimatedCreditsPct = 0;
  else if (fail === 0) estimatedCreditsPct = 100;
  else estimatedCreditsPct = Math.max(5, Math.round((succ / Math.max(1, succ + fail)) * 100));

  // Estimated creatives remaining ≈ estimatedCreditsPct (rough proxy; each
  // creative ≈ 1 brief + 1 image + 1 fidelity call, so 3 gateway calls).
  // Without a live balance, surface the pct only.

  return new Response(
    JSON.stringify({
      ok: true,
      credit_state: state.forecast_state ?? state.state,
      paused: state.paused || state.manual_pause,
      manual_pause: state.manual_pause ?? false,
      emergency_mode: state.emergency_mode ?? false,
      estimated_credits_pct: estimatedCreditsPct,
      credits_balance_initial: state.credits_balance_initial ?? null,
      credits_remaining: state.credits_remaining ?? null,
      credits_used_since_set: state.credits_used_since_set ?? 0,
      avg_credits_per_creative: state.avg_credits_per_creative ?? null,
      daily_burn_rate: state.daily_burn_rate ?? null,
      estimated_creatives_remaining: state.estimated_creatives_remaining ?? null,
      estimated_hours_remaining: state.estimated_hours_remaining ?? null,
      estimated_days_remaining: state.estimated_days_remaining ?? null,
      estimated_depletion_at: state.estimated_depletion_at ?? null,
      emergency_creative_threshold: state.emergency_creative_threshold ?? 20,
      alert_recipient_email: state.alert_recipient_email ?? null,
      forecast_updated_at: state.forecast_updated_at ?? null,
      last_success_at: state.last_success_at,
      last_402_at: state.last_402_at,
      consecutive_402_count: state.consecutive_402_count ?? 0,
      recent_success_count_1h: succ,
      recent_402_count_1h: fail,
      open_regen_jobs: openRegen.count ?? 0,
      draft_count: draftCount.count ?? 0,
      queue_count: queueCount.count ?? 0,
      pins_published_last_hour: publishedLastHour.count ?? 0,
      pins_published_last_24h: publishedToday.count ?? 0,
      last_published: lastPublishedRow.data ?? null,
      recent_events: recentEvents.data ?? [],
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});