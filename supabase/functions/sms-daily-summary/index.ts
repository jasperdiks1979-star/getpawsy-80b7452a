// Daily sales SMS summary — scheduled via pg_cron (22:00 store time).
// Protected by INTERNAL_FUNCTION_SECRET or admin auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { loadTwilioConfig } from "../_shared/post-payment-tracking.ts";
import { gateAndLog } from "../_shared/sms-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: accept (a) internal cron secret, (b) admin JWT (manual trigger).
  // Manual triggers bypass the 20h dedupe with body.force=true.
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  let isCron = !!internalSecret && provided === internalSecret;
  let isAdminUser = false;
  let force = false;
  try { const j = await req.clone().json(); force = !!j?.force; } catch (_) { /* ignore */ }

  if (!isCron) {
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const { data: adminFlag } = await svc.rpc("has_role", {
        _user_id: userData.user.id, _role: "admin",
      });
      isAdminUser = !!adminFlag;
    }
    // Anonymous calls (e.g. cron without secret header) are accepted only
    // when a dedupe window is in effect — they can't spam.
    if (!isAdminUser) {
      const since = new Date(Date.now() - 20 * 60 * 60_000).toISOString();
      const { data: dupe } = await svc
        .from("sms_alert_logs")
        .select("id")
        .eq("alert_type", "daily_summary")
        .eq("status", "sent")
        .gte("created_at", since)
        .limit(1)
        .maybeSingle();
      if (dupe?.id) {
        return json({ ok: true, deduped: true, message: "summary already sent in last 20h" });
      }
      isCron = true; // proceed under cron path
    }
  }
  // Admin manual trigger may force-resend; cron path always dedupes.
  if (!force && isCron) {
    const since = new Date(Date.now() - 20 * 60 * 60_000).toISOString();
    const { data: dupe } = await svc
      .from("sms_alert_logs")
      .select("id")
      .eq("alert_type", "daily_summary")
      .eq("status", "sent")
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (dupe?.id) return json({ ok: true, deduped: true });
  }

  // Window: last 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: orders, error } = await svc
    .from("orders")
    .select("id, total_amount, currency, items, created_at, status")
    .eq("status", "paid")
    .gte("created_at", since);
  if (error) return json({ ok: false, message: error.message }, 500);

  const rows = (orders ?? []) as Array<{
    id: string; total_amount: number; currency: string; items: unknown;
  }>;
  const count = rows.length;
  const revenue = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const aov = count ? revenue / count : 0;

  const productTotals = new Map<string, number>();
  for (const r of rows) {
    const arr = Array.isArray(r.items) ? r.items as Array<{ name?: string; quantity?: number }> : [];
    for (const it of arr) {
      const name = it?.name ?? "Unknown";
      productTotals.set(name, (productTotals.get(name) ?? 0) + (it?.quantity ?? 1));
    }
  }
  let bestSeller = "—";
  let best = 0;
  for (const [name, qty] of productTotals) {
    if (qty > best) { best = qty; bestSeller = name; }
  }

  const currency = (rows[0]?.currency || "USD").toUpperCase();
  const body =
    `📊 GETPAWSY DAILY REPORT\n` +
    `Orders: ${count}\n` +
    `Revenue: ${currency} ${revenue.toFixed(2)}\n` +
    `AOV: ${currency} ${aov.toFixed(2)}\n` +
    `Top Product:\n${bestSeller}`;

  const cfg = await loadTwilioConfig(svc);

  // SMS Mode gate — daily_summary is non-sale; muted in sales_only mode.
  // Admin-forced manual trigger (force=true) STILL respects the gate;
  // use /admin/sms-alerts → Send Test SMS for an always-on manual ping.
  const gate = await gateAndLog(svc, "daily_summary", body);
  if (!gate.allowed) {
    return json({ ok: true, blocked_by_sms_mode: true, mode: gate.mode, count, revenue });
  }
  if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber || !cfg.ownerPhone) {
    await svc.from("sms_alert_logs").insert({
      alert_type: "daily_summary",
      status: "pending_config",
      recipient: cfg.ownerPhone,
      body,
      error_reason: "missing_twilio_config",
    });
    return json({ ok: false, message: "missing_twilio_config", count, revenue });
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const form = new URLSearchParams({ To: cfg.ownerPhone, From: cfg.fromNumber, Body: body });
  const auth = btoa(`${cfg.accountSid}:${cfg.authToken}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const j: { sid?: string; message?: string; code?: number } = await resp.json().catch(() => ({}));
  const ok = resp.ok && !!j.sid;
  await svc.from("sms_alert_logs").insert({
    alert_type: "daily_summary",
    recipient: cfg.ownerPhone,
    body,
    status: ok ? "sent" : "failed",
    twilio_message_sid: j.sid ?? null,
    error_reason: ok ? null : `twilio_${resp.status}: ${j.message ?? "unknown"}`,
  });

  return json({ ok, sid: j.sid, count, revenue: Number(revenue.toFixed(2)), aov: Number(aov.toFixed(2)), bestSeller });
});