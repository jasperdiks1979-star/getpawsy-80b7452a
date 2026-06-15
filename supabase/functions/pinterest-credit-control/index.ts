// Pinterest Credit Control
// ───────────────────────────────────────────────────────────────────────────
// Manual operator actions for the credit protection system. All actions only
// touch `pinterest_credit_state` (id=1) and write an audit row into
// `pinterest_credit_events`. The publish pipeline is never touched here.
//
// Actions:
//   - pause              : set manual_pause=true (paused)
//   - resume             : set manual_pause=false, clear 402 backoff
//   - set_balance        : record an authoritative credit balance snapshot
//   - set_recipient      : alert email address
//   - set_threshold      : emergency_creative_threshold (default 20)
//   - recompute          : recompute forecast on demand
// ───────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { recomputeForecast } from "../_shared/pinterest-credit-forecast.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action ?? "").trim();

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (action === "pause") {
    const reason = String(body?.reason ?? "manual_pause");
    await supabase.from("pinterest_credit_state").update({
      manual_pause: true,
      manual_pause_at: new Date().toISOString(),
      manual_pause_reason: reason,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    await supabase.from("pinterest_credit_events").insert({
      event_type: "paused",
      function_name: "manual",
      message: `Manual pause: ${reason}`,
    });
    const snap = await recomputeForecast(supabase);
    return json({ ok: true, action, snap });
  }

  if (action === "resume") {
    await supabase.from("pinterest_credit_state").update({
      manual_pause: false,
      manual_pause_at: null,
      manual_pause_reason: null,
      paused: false,
      consecutive_402_count: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    await supabase.from("pinterest_credit_events").insert({
      event_type: "resumed",
      function_name: "manual",
      message: "Manual resume",
    });
    const snap = await recomputeForecast(supabase);
    return json({ ok: true, action, snap });
  }

  if (action === "set_balance") {
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ ok: false, message: "amount must be > 0" }, 400);
    }
    await supabase.from("pinterest_credit_state").update({
      credits_balance_initial: amount,
      credits_balance_set_at: new Date().toISOString(),
      credits_used_since_set: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    const snap = await recomputeForecast(supabase);
    return json({ ok: true, action, snap });
  }

  if (action === "set_recipient") {
    const email = String(body?.email ?? "").trim();
    if (!email.includes("@")) return json({ ok: false, message: "invalid email" }, 400);
    await supabase.from("pinterest_credit_state").update({
      alert_recipient_email: email,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    return json({ ok: true, action, email });
  }

  if (action === "set_threshold") {
    const threshold = Math.max(1, Math.floor(Number(body?.threshold ?? 20)));
    await supabase.from("pinterest_credit_state").update({
      emergency_creative_threshold: threshold,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    const snap = await recomputeForecast(supabase);
    return json({ ok: true, action, snap });
  }

  if (action === "recompute" || action === "") {
    const snap = await recomputeForecast(supabase);
    return json({ ok: true, action: "recompute", snap });
  }

  return json({ ok: false, message: `unknown action: ${action}` }, 400);
});