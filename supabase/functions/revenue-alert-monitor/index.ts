// Revenue Alert Monitor — cron checks thresholds + sends SMS via Twilio.
// Dedupes via revenue_alert_log (alert_key + cool-down window).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gateAndLog } from "../_shared/sms-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SecretMap = Record<string, string | null>;

async function loadTwilio(svc: ReturnType<typeof createClient>): Promise<SecretMap> {
  const KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "OWNER_ALERT_PHONE"] as const;
  const { data } = await svc.from("admin_secrets").select("name,value").in("name", KEYS as unknown as string[]);
  const map: SecretMap = {};
  for (const k of KEYS) map[k] = Deno.env.get(k) ?? null;
  for (const row of (data ?? []) as { name: string; value: string }[]) map[row.name] = row.value;
  return map;
}

async function sendSms(cfg: SecretMap, body: string) {
  const sid = cfg.TWILIO_ACCOUNT_SID, tok = cfg.TWILIO_AUTH_TOKEN, from = cfg.TWILIO_FROM_NUMBER, to = cfg.OWNER_ALERT_PHONE;
  if (!sid || !tok || !from || !to) return { ok: false, error: "missing_twilio_config" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = btoa(`${sid}:${tok}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 320) }).toString(),
  });
  const j: { sid?: string; message?: string } = await resp.json().catch(() => ({}));
  return resp.ok && j.sid
    ? { ok: true, sid: j.sid }
    : { ok: false, error: `twilio_${resp.status}: ${j.message ?? "unknown"}` };
}

async function fire(
  svc: ReturnType<typeof createClient>,
  cfg: SecretMap,
  alertKey: string,
  alertType: string,
  message: string,
  cooldownMin: number,
  meta: Record<string, unknown> = {},
) {
  // SMS Mode gate — every revenue-monitor alert (pinterest_stall, no_publish_30m,
  // queue_not_draining, daily summaries, etc.) is non-sale and must be muted in
  // sales_only mode. Logged via gateAndLog for admin visibility.
  const gate = await gateAndLog(svc, alertType, message);
  if (!gate.allowed) {
    // Still record in revenue_alert_log so dashboards show the would-be alert.
    try {
      await svc.from("revenue_alert_log").insert({
        alert_key: alertKey, alert_type: alertType, message,
        twilio_sid: null, sent_ok: false,
        error: `blocked_by_sms_mode=${gate.mode}`,
        meta: { ...meta, sms_mode_blocked: true },
      });
    } catch (_) { /* ignore */ }
    return { skipped: true, blocked: true, alertKey, mode: gate.mode };
  }

  // Dedupe via cooldown
  const since = new Date(Date.now() - cooldownMin * 60_000).toISOString();
  const { data: recent } = await svc
    .from("revenue_alert_log").select("id").eq("alert_key", alertKey).eq("sent_ok", true)
    .gte("created_at", since).limit(1);
  if ((recent ?? []).length > 0) return { skipped: true, alertKey };

  const sms = await sendSms(cfg, `[GetPawsy] ${message}`);
  await svc.from("revenue_alert_log").insert({
    alert_key: alertKey, alert_type: alertType, message,
    twilio_sid: sms.ok ? (sms as { sid: string }).sid : null,
    sent_ok: sms.ok, error: sms.ok ? null : (sms as { error: string }).error, meta,
  });
  return { sent: sms.ok, alertKey, error: sms.ok ? null : (sms as { error: string }).error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE);

  try {
    const { data: cfgRow } = await svc.from("revenue_alert_config").select("*").eq("id", true).maybeSingle();
    if (!cfgRow) return json({ ok: true, traceId, message: "no_config" });
    const cfg = cfgRow as Record<string, any>;
    const twilio = await loadTwilio(svc);
    const results: any[] = [];
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(now.getTime() - 7 * 86400_000);
    const dayAgo = new Date(now.getTime() - 86400_000);

    // 1) Pinterest stall
    if (cfg.alert_pinterest_stall) {
      const { data: last } = await svc.from("pinterest_pin_queue")
        .select("posted_at").eq("status", "posted")
        .order("posted_at", { ascending: false }).limit(1);
      const lastAt = (last?.[0] as { posted_at: string } | undefined)?.posted_at;
      const stallMin = Number(cfg.pinterest_stall_minutes ?? 120);
      const mins = lastAt ? Math.round((Date.now() - new Date(lastAt).getTime()) / 60000) : 9999;
      if (mins >= stallMin) {
        results.push(await fire(svc, twilio,
          `pinterest_stall:${Math.floor(Date.now() / (stallMin * 60_000))}`,
          "pinterest_stall",
          `Pinterest stalled: no pins posted for ${mins}m (threshold ${stallMin}m).`,
          stallMin, { mins, lastAt }));
      }
    }

    // 2) Out of stock — fires once per product per 24h
    if (cfg.alert_out_of_stock) {
      const { data: oos } = await svc.from("products")
        .select("id,name,slug").or("available.eq.false,in_stock.eq.false")
        .eq("active", true).limit(20);
      for (const p of (oos ?? []) as { id: string; name: string; slug: string }[]) {
        results.push(await fire(svc, twilio,
          `oos:${p.id}:${startOfDay.toISOString().slice(0, 10)}`,
          "out_of_stock",
          `Out of stock: ${p.name}`,
          1440, { product_id: p.id, slug: p.slug }));
      }
    }

    // 3) Checkout errors
    if (cfg.alert_checkout_errors) {
      const { count } = await svc.from("checkout_funnel_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
        .not("error_reason", "is", null);
      const threshold = Number(cfg.checkout_error_threshold ?? 3);
      if ((count ?? 0) >= threshold) {
        results.push(await fire(svc, twilio,
          `checkout_errors:${Math.floor(Date.now() / 3600_000)}`,
          "checkout_errors",
          `${count} checkout errors in last hour (threshold ${threshold}).`,
          60, { count }));
      }
    }

    // 4) New order
    if (cfg.alert_new_order) {
      const { data: recent } = await svc.from("orders")
        .select("id,total_amount,currency,customer_email,created_at")
        .eq("status", "paid")
        .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
        .order("created_at", { ascending: false }).limit(5);
      for (const o of (recent ?? []) as any[]) {
        results.push(await fire(svc, twilio,
          `new_order:${o.id}`, "new_order",
          `New order $${(Number(o.total_amount) / 100).toFixed(2)} ${o.currency?.toUpperCase() ?? "USD"} — ${o.customer_email ?? "guest"}`,
          1440, { order_id: o.id }));
      }
    }

    // 5) Revenue thresholds
    if (cfg.alert_revenue_threshold) {
      const [rToday, rWeek] = await Promise.all([
        svc.from("orders").select("total_amount").eq("status", "paid").gte("created_at", startOfDay.toISOString()),
        svc.from("orders").select("total_amount").eq("status", "paid").gte("created_at", weekAgo.toISOString()),
      ]);
      const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const todayC = sum(rToday.data), weekC = sum(rWeek.data);
      if (todayC >= Number(cfg.revenue_threshold_today_cents)) {
        results.push(await fire(svc, twilio,
          `rev_today:${startOfDay.toISOString().slice(0, 10)}`, "revenue_threshold",
          `Revenue today crossed $${(todayC / 100).toFixed(0)} (threshold $${(cfg.revenue_threshold_today_cents / 100).toFixed(0)}).`,
          1440, { todayC }));
      }
      if (weekC >= Number(cfg.revenue_threshold_week_cents)) {
        const wkKey = `${now.getUTCFullYear()}-W${Math.floor(now.getTime() / (7 * 86400_000))}`;
        results.push(await fire(svc, twilio,
          `rev_week:${wkKey}`, "revenue_threshold",
          `Weekly revenue crossed $${(weekC / 100).toFixed(0)} (threshold $${(cfg.revenue_threshold_week_cents / 100).toFixed(0)}).`,
          10080, { weekC }));
      }
    }

    return json({ ok: true, traceId, fired: results });
  } catch (e) {
    console.error("[revenue-alert-monitor]", traceId, e);
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});