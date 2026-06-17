// SMS Alerts Admin — secure CRUD + test/replay/validate.
// All actions require an authenticated admin user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSmsMode, setSmsMode, type SmsMode } from "../_shared/sms-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SECRET_KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "OWNER_ALERT_PHONE",
] as const;
type SecretKey = (typeof SECRET_KEYS)[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mask(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

async function loadSecrets(svc: ReturnType<typeof createClient>) {
  const { data } = await svc
    .from("admin_secrets")
    .select("name, value, updated_at")
    .in("name", SECRET_KEYS as unknown as string[]);
  const map: Record<string, { value: string; updated_at: string } | null> = {};
  for (const k of SECRET_KEYS) map[k] = null;
  for (const row of data ?? []) {
    map[(row as { name: string }).name] = {
      value: (row as { value: string }).value,
      updated_at: (row as { updated_at: string }).updated_at,
    };
  }
  // Fallback to env if no DB row
  for (const k of SECRET_KEYS) {
    if (!map[k]) {
      const envVal = Deno.env.get(k);
      if (envVal) map[k] = { value: envVal, updated_at: "" };
    }
  }
  return map;
}

function validateConfig(cfg: Record<string, { value: string } | null>) {
  const checks: { field: SecretKey; pass: boolean; reason: string }[] = [];
  const sid = cfg.TWILIO_ACCOUNT_SID?.value ?? "";
  checks.push({
    field: "TWILIO_ACCOUNT_SID",
    pass: /^AC[a-f0-9]{32}$/i.test(sid),
    reason: sid ? (/^AC[a-f0-9]{32}$/i.test(sid) ? "valid format" : "must start with AC + 32 hex") : "missing",
  });
  const tok = cfg.TWILIO_AUTH_TOKEN?.value ?? "";
  checks.push({
    field: "TWILIO_AUTH_TOKEN",
    pass: tok.length >= 30,
    reason: tok ? (tok.length >= 30 ? "present" : "too short") : "missing",
  });
  const from = cfg.TWILIO_FROM_NUMBER?.value ?? "";
  checks.push({
    field: "TWILIO_FROM_NUMBER",
    pass: /^\+[1-9]\d{6,14}$/.test(from),
    reason: from ? (/^\+[1-9]\d{6,14}$/.test(from) ? "valid E.164" : "must be E.164 (+15558675310)") : "missing",
  });
  const own = cfg.OWNER_ALERT_PHONE?.value ?? "";
  checks.push({
    field: "OWNER_ALERT_PHONE",
    pass: /^\+[1-9]\d{6,14}$/.test(own),
    reason: own ? (/^\+[1-9]\d{6,14}$/.test(own) ? "valid E.164" : "must be E.164 (+15558675310)") : "missing",
  });
  return { pass: checks.every((c) => c.pass), checks };
}

async function twilioSend(
  cfg: Record<string, { value: string } | null>,
  body: string,
): Promise<{ ok: boolean; sid?: string; status: number; error?: string }> {
  const sid = cfg.TWILIO_ACCOUNT_SID?.value;
  const tok = cfg.TWILIO_AUTH_TOKEN?.value;
  const from = cfg.TWILIO_FROM_NUMBER?.value;
  const to = cfg.OWNER_ALERT_PHONE?.value;
  if (!sid || !tok || !from || !to) {
    return { ok: false, status: 0, error: "missing_config" };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = btoa(`${sid}:${tok}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const j: { sid?: string; message?: string; code?: number } = await resp
    .json()
    .catch(() => ({}));
  if (resp.ok && j.sid) return { ok: true, sid: j.sid, status: resp.status };
  return {
    ok: false,
    status: resp.status,
    error: `twilio_${resp.status}_${j.code ?? ""}: ${j.message ?? "unknown"}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ ok: false, message: "unauthorized" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ ok: false, message: "unauthorized" }, 401);
  }
  const svc = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await svc.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ ok: false, message: "forbidden" }, 403);

  let body: { action?: string; values?: Partial<Record<SecretKey, string>> } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action ?? "status";

  try {
    if (action === "status") {
      const cfg = await loadSecrets(svc);
      const status: Record<string, { configured: boolean; preview: string | null; updated_at: string | null }> = {};
      for (const k of SECRET_KEYS) {
        status[k] = {
          configured: !!cfg[k]?.value,
          preview: mask(cfg[k]?.value ?? null),
          updated_at: cfg[k]?.updated_at || null,
        };
      }
      const { data: last } = await svc
        .from("sms_alert_logs")
        .select("id, created_at, alert_type, status, twilio_message_sid, error_reason, recipient")
        .order("created_at", { ascending: false })
        .limit(20);
      const lastTest = (last ?? []).find((r) => (r as { alert_type: string }).alert_type === "test");
      const lastOrder = (last ?? []).find((r) => (r as { alert_type: string }).alert_type === "order");
      const sms_mode = await getSmsMode(svc);
      return json({ ok: true, status, recent: last ?? [], lastTest, lastOrder, sms_mode });
    }

    if (action === "get_mode") {
      const sms_mode = await getSmsMode(svc);
      return json({ ok: true, sms_mode });
    }

    if (action === "set_mode") {
      const m = (body as { mode?: string }).mode;
      if (m !== "sales_only" && m !== "sales_plus_critical" && m !== "all") {
        return json({ ok: false, message: "invalid mode" }, 400);
      }
      await setSmsMode(svc, m as SmsMode);
      return json({ ok: true, sms_mode: m });
    }

    if (action === "save") {
      const updates: { name: string; value: string; updated_by: string }[] = [];
      for (const k of SECRET_KEYS) {
        const v = body.values?.[k];
        if (typeof v === "string" && v.trim().length > 0) {
          updates.push({ name: k, value: v.trim(), updated_by: userData.user.id });
        }
      }
      if (updates.length === 0) return json({ ok: false, message: "no values provided" }, 400);
      const { error } = await svc.from("admin_secrets").upsert(updates, { onConflict: "name" });
      if (error) return json({ ok: false, message: error.message }, 500);
      return json({ ok: true, saved: updates.map((u) => u.name) });
    }

    if (action === "validate") {
      const cfg = await loadSecrets(svc);
      const result = validateConfig(cfg);
      return json({ ok: true, ...result });
    }

    if (action === "test") {
      const cfg = await loadSecrets(svc);
      const v = validateConfig(cfg);
      if (!v.pass) {
        await svc.from("sms_alert_logs").insert({
          alert_type: "test",
          status: "failed",
          recipient: cfg.OWNER_ALERT_PHONE?.value ?? null,
          error_reason: "validation_failed",
          body: null,
        });
        return json({ ok: false, message: "validation_failed", checks: v.checks }, 400);
      }
      const msg = "GetPawsy Test ✅\nSMS alerts are working correctly.";
      const result = await twilioSend(cfg, msg);
      await svc.from("sms_alert_logs").insert({
        alert_type: "test",
        status: result.ok ? "sent" : "failed",
        recipient: cfg.OWNER_ALERT_PHONE?.value ?? null,
        body: msg,
        twilio_message_sid: result.sid ?? null,
        error_reason: result.ok ? null : result.error,
      });
      return json({ ok: result.ok, sid: result.sid, error: result.error });
    }

    if (action === "replay") {
      const cfg = await loadSecrets(svc);
      const v = validateConfig(cfg);
      if (!v.pass) return json({ ok: false, message: "validation_failed", checks: v.checks }, 400);

      const { data: order } = await svc
        .from("orders")
        .select("id, stripe_session_id, stripe_payment_intent_id, total_amount, currency, items, customer_email, created_at")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!order) return json({ ok: false, message: "no_paid_order_found" }, 404);

      const o = order as {
        id: string;
        stripe_session_id: string | null;
        stripe_payment_intent_id: string | null;
        total_amount: number;
        currency: string;
        items: unknown;
      };
      const sessionId = o.stripe_session_id ?? `replay_${o.id}`;

      // Idempotency — block duplicate "sent" replays for same session.
      const { data: existing } = await svc
        .from("sms_alert_logs")
        .select("id, status, twilio_message_sid, created_at")
        .eq("alert_type", "replay")
        .eq("stripe_session_id", sessionId)
        .eq("status", "sent")
        .maybeSingle();
      if (existing) {
        return json({
          ok: true,
          duplicate: true,
          message: "Replay already sent for this order",
          previous: existing,
        });
      }

      const itemsArr = Array.isArray(o.items) ? (o.items as Array<{ quantity?: number }>) : [];
      const itemCount = itemsArr.reduce((s, it) => s + (it?.quantity ?? 1), 0) || 1;
      const shortSid = sessionId.slice(0, 14);
      const msg =
        `GetPawsy order ✅ ${Number(o.total_amount).toFixed(2)} ` +
        `${(o.currency || "USD").toUpperCase()} - ${itemCount} item(s) - ` +
        `Stripe: ${shortSid} [REPLAY]`;

      const result = await twilioSend(cfg, msg);
      await svc.from("sms_alert_logs").insert({
        alert_type: "replay",
        order_id: o.id,
        stripe_session_id: sessionId,
        recipient: cfg.OWNER_ALERT_PHONE?.value ?? null,
        body: msg,
        status: result.ok ? "sent" : "failed",
        twilio_message_sid: result.sid ?? null,
        error_reason: result.ok ? null : result.error,
      });
      return json({
        ok: result.ok,
        order_id: o.id,
        stripe_session_id: sessionId,
        sid: result.sid,
        error: result.error,
      });
    }

    if (action === "stats") {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const { count: total } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent");
      const { count: today } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", startOfDay);
      const { count: totalAttempts } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .in("status", ["sent", "failed"]);
      const { count: failed } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed");
      const { data: lastSuccess } = await svc
        .from("sms_alert_logs")
        .select("created_at, alert_type, twilio_message_sid")
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: lastFailed } = await svc
        .from("sms_alert_logs")
        .select("created_at, alert_type, error_reason")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const denom = totalAttempts ?? 0;
      const successRate = denom ? Math.round(((total ?? 0) / denom) * 1000) / 10 : null;

      // Twilio account balance (best-effort).
      let balance: { amount: string; currency: string } | null = null;
      let balanceError: string | null = null;
      const cfg = await loadSecrets(svc);
      const sid = cfg.TWILIO_ACCOUNT_SID?.value;
      const tok = cfg.TWILIO_AUTH_TOKEN?.value;
      if (sid && tok) {
        try {
          const r = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`,
            { headers: { Authorization: `Basic ${btoa(`${sid}:${tok}`)}` } },
          );
          const j: { balance?: string; currency?: string; message?: string } = await r
            .json().catch(() => ({}));
          if (r.ok && j.balance) balance = { amount: j.balance, currency: j.currency ?? "USD" };
          else balanceError = j.message ?? `twilio_${r.status}`;
        } catch (e) {
          balanceError = (e as Error).message;
        }
      } else {
        balanceError = "missing_credentials";
      }

      return json({
        ok: true,
        totals: {
          total_sent: total ?? 0,
          sent_today: today ?? 0,
          failed: failed ?? 0,
          attempts: denom,
          success_rate_pct: successRate,
        },
        last_success: lastSuccess ?? null,
        last_failed: lastFailed ?? null,
        balance,
        balance_error: balanceError,
      });
    }

    if (action === "production_check") {
      // Twilio
      const cfg = await loadSecrets(svc);
      const validation = validateConfig(cfg);
      let twilioReachable = false;
      let twilioError: string | null = null;
      const tsid = cfg.TWILIO_ACCOUNT_SID?.value;
      const ttok = cfg.TWILIO_AUTH_TOKEN?.value;
      if (tsid && ttok) {
        try {
          const r = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${tsid}.json`,
            { headers: { Authorization: `Basic ${btoa(`${tsid}:${ttok}`)}` } },
          );
          twilioReachable = r.ok;
          if (!r.ok) twilioError = `twilio_${r.status}`;
        } catch (e) { twilioError = (e as Error).message; }
      } else twilioError = "missing_credentials";

      // Stripe
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE") || Deno.env.get("STRIPE_SECRET_KEY");
      const stripeWebhook = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      const stripeOk = !!stripeKey && !!stripeWebhook;

      // Recent SMS delivery health
      const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const { count: sentRecently } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", since);
      const { count: failedRecently } = await svc
        .from("sms_alert_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", since);

      // DB reachability proxy
      const { error: dbErr } = await svc
        .from("orders").select("id", { head: true, count: "exact" }).limit(1);
      const dbOk = !dbErr;

      // Webhook recent activity (paid orders in last 14d)
      const sinceWh = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
      const { count: paidRecently } = await svc
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "paid")
        .gte("created_at", sinceWh);
      const webhookOk = stripeOk && (paidRecently ?? 0) > 0;

      const checks = [
        { name: "Twilio credentials", pass: validation.pass, detail: validation.checks.map((c) => `${c.field}: ${c.reason}`).join(" · ") },
        { name: "Twilio API reachable", pass: twilioReachable, detail: twilioError ?? "200 OK" },
        { name: "Stripe configured", pass: stripeOk, detail: stripeOk ? "live/test key + webhook secret present" : "missing key or webhook secret" },
        { name: "Stripe webhook activity (14d)", pass: webhookOk, detail: `${paidRecently ?? 0} paid orders` },
        { name: "SMS delivery (7d)", pass: (sentRecently ?? 0) >= 0 && (failedRecently ?? 0) === 0, detail: `${sentRecently ?? 0} sent · ${failedRecently ?? 0} failed` },
        { name: "Database reachable", pass: dbOk, detail: dbOk ? "ok" : (dbErr?.message ?? "error") },
      ];
      const allPass = checks.every((c) => c.pass);
      return json({ ok: true, ready: allPass, checks });
    }

    if (action === "trigger_daily_summary") {
      const r = await fetch(
        `${SUPABASE_URL}/functions/v1/sms-daily-summary`,
        {
          method: "POST",
          headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const j = await r.json().catch(() => ({}));
      return json({ ok: r.ok, result: j });
    }

    return json({ ok: false, message: "unknown_action" }, 400);
  } catch (e) {
    console.error("[sms-alerts-admin] error:", e);
    return json({ ok: false, message: (e as Error).message }, 500);
  }
});