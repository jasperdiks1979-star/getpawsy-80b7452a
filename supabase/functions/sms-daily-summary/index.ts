// Daily sales SMS summary — scheduled via pg_cron (22:00 store time).
// Protected by INTERNAL_FUNCTION_SECRET or admin auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { loadTwilioConfig } from "../_shared/post-payment-tracking.ts";

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

  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!internalSecret || provided !== internalSecret) {
    // Allow admin users via JWT as fallback (manual trigger from UI).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, message: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ ok: false, message: "unauthorized" }, 401);
    const svcCheck = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isAdmin } = await svcCheck.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) return json({ ok: false, message: "forbidden" }, 403);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

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