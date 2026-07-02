// Pinterest Credit Probe
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight 1-token chat completion against the Lovable AI Gateway used to
// detect when credits have been restored. Called on a 10-minute cron when
// `pinterest_credit_state.paused = true`. On 200 → unpauses and resets state.
// On 402 → leaves the state paused.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recordCreditEvent, isCreditPaused } from "../_shared/pinterest-credit-guard.ts";
import { shouldProbeNow, recordProbeOutcome } from "../_shared/ai-cost-optimizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ ok: false, message: "LOVABLE_API_KEY missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const before = await isCreditPaused(supabase);

  // Parse flags (POST body or querystring). `force=true` bypasses backoff.
  let force = false;
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("force") === "true") force = true;
    if (req.method === "POST") {
      const body = await req.clone().json().catch(() => null);
      if (body && (body.force === true || body.force === "true")) force = true;
    }
  } catch { /* noop */ }

  // ── Evidence-backed auto-recovery (zero-cost path) ─────────────────────
  // If the gateway has produced any successful response within the last
  // 10 minutes, credits are demonstrably available and the paused flag is
  // stale. Clear it without spending a probe token.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentSuccess } = await supabase
    .from("pinterest_credit_events")
    .select("id, created_at, function_name, event_type")
    .in("event_type", ["success", "probe_success"])
    .gte("created_at", tenMinAgo)
    .order("created_at", { ascending: false })
    .limit(1);
  if (before.paused && recentSuccess && recentSuccess.length > 0) {
    await recordProbeOutcome(supabase, 200); // reset backoff
    await recordCreditEvent(supabase, {
      event_type: "resumed",
      function_name: "credit-probe:evidence",
      message: "auto_recovered_from_recent_success",
      raw: { evidence: recentSuccess[0] },
    });
    return new Response(
      JSON.stringify({ ok: true, recovered: true, mode: "evidence", evidence: recentSuccess[0], before }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Genesis V6.3 — exponential backoff. Skip the probe entirely if the next
  // allowed window has not been reached. This stops the gateway from being
  // hammered with 402s every minute when credits are exhausted.
  const gate = await shouldProbeNow(supabase);
  if (!gate.allowed && !force) {
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason: "backoff", next_allowed_at: gate.nextAllowedAt, paused: before.paused }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Minimal request: 1-token text completion via cheap model.
  let status = 0;
  let detail: any = null;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: "ok" }],
        max_tokens: 1,
      }),
    });
    status = resp.status;
    try { detail = await resp.json(); } catch { /* non-JSON */ }
  } catch (e) {
    await recordCreditEvent(supabase, {
      event_type: "probe_failed",
      message: (e as Error).message,
    });
    return new Response(
      JSON.stringify({ ok: false, status: 0, error: (e as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status === 402) {
    await recordProbeOutcome(supabase, 402);
    await recordCreditEvent(supabase, {
      event_type: "payment_required",
      status_code: 402,
      function_name: "credit-probe",
      message: "probe_402_still_exhausted",
    });
    await recordCreditEvent(supabase, {
      event_type: "probe_failed",
      status_code: 402,
      function_name: "credit-probe",
      message: "still_exhausted",
    });
    return new Response(
      JSON.stringify({ ok: false, status, paused: true, before }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (status >= 200 && status < 300) {
    await recordProbeOutcome(supabase, status);
    await recordCreditEvent(supabase, {
      event_type: "probe_success",
      status_code: status,
      function_name: "credit-probe",
    });
    if (before.paused) {
      await recordCreditEvent(supabase, {
        event_type: "resumed",
        message: "credits_restored",
      });
    }
    return new Response(
      JSON.stringify({ ok: true, status, resumed: before.paused }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  await recordCreditEvent(supabase, {
    event_type: "error",
    status_code: status,
    function_name: "credit-probe",
    message: detail?.error?.message ?? `http_${status}`,
  });
  await recordProbeOutcome(supabase, status || 500);
  return new Response(
    JSON.stringify({ ok: false, status, detail }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});