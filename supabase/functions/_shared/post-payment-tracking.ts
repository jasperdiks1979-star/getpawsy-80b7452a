// ─────────────────────────────────────────────────────────────────────────────
// post-payment-tracking.ts
// Shared helpers invoked from stripe-webhook (and one-off backfills) to
// mirror a successful order across:
//   • lp_funnel_events    (purchase row with full payload)
//   • visitor_activity    (purchase row with order_id / order_value)
//   • pinterest_capi_outbox (CAPI checkout event — relay drains it)
//   • order_sms_alerts    (owner Twilio SMS)
//
// All helpers are idempotent against the Stripe session id so a webhook
// retry, manual backfill, or duplicate event cannot create duplicates.
// Every helper swallows its own errors — order processing must never
// fail because a tracking mirror failed.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SBClient = any;

import { gateAndLog } from "./sms-mode.ts";

export interface OrderItem {
  id?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

export interface PostPaymentContext {
  orderId: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  totalValue: number;
  currency: string;
  items: OrderItem[];
  customerEmail: string | null;
  customerName?: string | null;
  country?: string | null;
  orderNumber?: string | null;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── lp_funnel_events.purchase mirror ────────────────────────────────────────
export async function mirrorLpFunnelPurchase(
  supabase: SBClient,
  ctx: PostPaymentContext,
): Promise<void> {
  try {
    const idemKey = `purchase_${ctx.stripeSessionId}`;
    // Idempotency: check before insert (no unique index on idempotency_key).
    const { data: existing } = await supabase
      .from("lp_funnel_events")
      .select("id")
      .eq("event_name", "purchase")
      .eq("idempotency_key", idemKey)
      .maybeSingle();
    if (existing?.id) {
      console.log("[POST-PAY] lp_funnel purchase already mirrored:", idemKey);
      return;
    }

    const firstItem = ctx.items[0] || {};
    await supabase.from("lp_funnel_events").insert({
      event_name: "purchase",
      page_path: "/payment-success",
      value: ctx.totalValue,
      product_id: firstItem.id ?? null,
      product_name: firstItem.name ?? null,
      source_component: "stripe_webhook",
      event_source: "server",
      idempotency_key: idemKey,
      raw_payload: {
        transaction_id: ctx.stripeSessionId,
        payment_intent_id: ctx.stripePaymentIntentId,
        order_id: ctx.orderId,
        currency: ctx.currency,
        value: ctx.totalValue,
        item_count: ctx.items.reduce((s, it) => s + (it.quantity ?? 1), 0),
        items: ctx.items.map((it) => ({
          item_id: it.id,
          item_name: it.name,
          price: it.price,
          quantity: it.quantity ?? 1,
        })),
        customer_email: ctx.customerEmail,
      },
    });
    console.log("[POST-PAY] lp_funnel purchase mirrored:", idemKey);
  } catch (e) {
    console.error("[POST-PAY] lp_funnel mirror failed:", e);
  }
}

// ── visitor_activity.purchase mirror ────────────────────────────────────────
export async function mirrorVisitorActivityPurchase(
  supabase: SBClient,
  ctx: PostPaymentContext,
): Promise<void> {
  try {
    // Idempotency: dedupe on (activity_type='purchase', order_id=$orderId).
    const { data: existing } = await supabase
      .from("visitor_activity")
      .select("id")
      .eq("activity_type", "purchase")
      .eq("order_id", ctx.orderId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      console.log("[POST-PAY] visitor_activity purchase exists:", ctx.orderId);
      return;
    }

    const firstItem = ctx.items[0] || {};
    const itemCount = ctx.items.reduce((s, it) => s + (it.quantity ?? 1), 0);
    await supabase.from("visitor_activity").insert({
      activity_type: "purchase",
      page_path: "/payment-success",
      order_id: ctx.orderId,
      order_value: ctx.totalValue,
      product_id: firstItem.id ?? null,
      product_name: firstItem.name ?? null,
      product_price: firstItem.price ?? null,
      product_quantity: itemCount || 1,
      traffic_quality: "clean",
    });
    console.log("[POST-PAY] visitor_activity purchase inserted:", ctx.orderId);
  } catch (e) {
    console.error("[POST-PAY] visitor_activity mirror failed:", e);
  }
}

// ── pinterest_capi_outbox: enqueue checkout/purchase event ──────────────────
export async function enqueuePinterestPurchaseCapi(
  supabase: SBClient,
  ctx: PostPaymentContext,
): Promise<void> {
  try {
    const eventName = "checkout"; // Pinterest's purchase-equivalent event
    const eventId = ctx.stripeSessionId;
    // Unique (event_name, event_id) prevents duplicates — use upsert/ignore.
    const userData: Record<string, unknown> = {
      client_session: ctx.stripeSessionId,
    };
    if (ctx.customerEmail) {
      userData.em = [await sha256Hex(ctx.customerEmail)];
    }
    const customData: Record<string, unknown> = {
      order_id: ctx.orderId,
      payment_intent_id: ctx.stripePaymentIntentId,
      item_count: ctx.items.reduce((s, it) => s + (it.quantity ?? 1), 0),
      content_ids: ctx.items.map((it) => it.id).filter(Boolean),
    };
    const { error } = await supabase
      .from("pinterest_capi_outbox")
      .upsert(
        {
          event_name: eventName,
          event_id: eventId,
          value: ctx.totalValue,
          currency: (ctx.currency || "USD").toUpperCase(),
          user_data: userData,
          custom_data: customData,
          status: "pending",
        },
        { onConflict: "event_name,event_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error("[POST-PAY] capi outbox enqueue error:", error);
      return;
    }
    console.log("[POST-PAY] capi outbox enqueued:", eventName, eventId);

    // Fire-and-forget drain. Relay is safe to re-invoke; it processes
    // pending rows only and the unique index prevents replays.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (supabaseUrl && serviceKey) {
      fetch(`${supabaseUrl}/functions/v1/pinterest-capi-relay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}` },
      }).catch((err) => console.error("[POST-PAY] capi relay invoke:", err));
    }
  } catch (e) {
    console.error("[POST-PAY] capi outbox enqueue failed:", e);
  }
}

// ── order_sms_alerts: owner Twilio SMS ──────────────────────────────────────
export async function sendOrderSmsAlert(
  supabase: SBClient,
  ctx: PostPaymentContext,
): Promise<void> {
  const cfg = await loadTwilioConfig(supabase);
  const { accountSid, authToken, fromNumber, ownerPhone } = cfg;

  const itemCount = ctx.items.reduce((s, it) => s + (it.quantity ?? 1), 0) || 1;
  const currency = (ctx.currency || "USD").toUpperCase();
  const orderNumber = ctx.orderNumber || ctx.orderId.slice(0, 8).toUpperCase();
  const customerName = ctx.customerName || ctx.customerEmail?.split("@")[0] || "Guest";
  const country = ctx.country || "—";
  const topProduct = ctx.items[0]?.name || "Product";
  const body =
    `🎉 NEW GETPAWSY ORDER\n` +
    `Order: #${orderNumber}\n` +
    `Amount: ${currency} ${ctx.totalValue.toFixed(2)}\n` +
    `Items: ${itemCount}\n` +
    `Customer: ${customerName}\n` +
    `Country: ${country}\n` +
    `Top Product:\n${topProduct}\n` +
    `Stripe:\nPayment Succeeded ✅`;

  try {
    // Idempotency: dedupe on stripe_session_id (unique index).
    const { data: existing } = await supabase
      .from("order_sms_alerts")
      .select("id, status")
      .eq("stripe_session_id", ctx.stripeSessionId)
      .maybeSingle();
    if (existing?.id && existing.status === "sent") {
      console.log("[POST-PAY] SMS already sent:", ctx.stripeSessionId);
      return;
    }

    // No Twilio config → record pending_config row and stop (never block order).
    if (!accountSid || !authToken || !fromNumber || !ownerPhone) {
      const missing = [
        !accountSid && "TWILIO_ACCOUNT_SID",
        !authToken && "TWILIO_AUTH_TOKEN",
        !fromNumber && "TWILIO_FROM_NUMBER",
        !ownerPhone && "OWNER_ALERT_PHONE",
      ].filter(Boolean).join(", ");
      await supabase
        .from("order_sms_alerts")
        .upsert(
          {
            order_id: ctx.orderId,
            stripe_session_id: ctx.stripeSessionId,
            stripe_payment_intent_id: ctx.stripePaymentIntentId,
            amount: ctx.totalValue,
            currency: (ctx.currency || "USD").toUpperCase(),
            item_count: itemCount,
            to_phone: ownerPhone ?? null,
            body,
            status: "pending_config",
            error_reason: `missing_secrets: ${missing}`,
          },
          { onConflict: "stripe_session_id", ignoreDuplicates: false },
        );
      await logSmsEvent(supabase, {
        alert_type: "order",
        order_id: ctx.orderId,
        stripe_session_id: ctx.stripeSessionId,
        recipient: ownerPhone ?? null,
        body,
        status: "pending_config",
        error_reason: `missing_secrets: ${missing}`,
      });
      console.warn("[POST-PAY] SMS pending_config — missing:", missing);
      return;
    }

    const result = await twilioSendRaw(cfg, body);
    const json = { sid: result.sid, message: result.error };
    const resp = { ok: result.ok, status: result.status } as { ok: boolean; status: number };

    if (resp.ok && json.sid) {
      await supabase
        .from("order_sms_alerts")
        .upsert(
          {
            order_id: ctx.orderId,
            stripe_session_id: ctx.stripeSessionId,
            stripe_payment_intent_id: ctx.stripePaymentIntentId,
            amount: ctx.totalValue,
            currency: (ctx.currency || "USD").toUpperCase(),
            item_count: itemCount,
            to_phone: ownerPhone,
            body,
            status: "sent",
            twilio_message_sid: json.sid,
            attempts: 1,
            sent_at: new Date().toISOString(),
            error_reason: null,
          },
          { onConflict: "stripe_session_id", ignoreDuplicates: false },
        );
      await logSmsEvent(supabase, {
        alert_type: "order",
        order_id: ctx.orderId,
        stripe_session_id: ctx.stripeSessionId,
        recipient: ownerPhone,
        body,
        status: "sent",
        twilio_message_sid: json.sid,
      });
      console.log("[POST-PAY] SMS sent:", json.sid);

      // ── High-value follow-up alert (>= $100 in USD-equivalent) ───────
      if (currency === "USD" && ctx.totalValue >= 100) {
        const hvBody =
          `🔥 HIGH VALUE ORDER\n` +
          `Amount: ${currency} ${ctx.totalValue.toFixed(2)}\n` +
          `Customer: ${customerName}`;
        await sendHighValueAlert(supabase, ctx, hvBody, cfg);
      }
    } else {
      await supabase
        .from("order_sms_alerts")
        .upsert(
          {
            order_id: ctx.orderId,
            stripe_session_id: ctx.stripeSessionId,
            stripe_payment_intent_id: ctx.stripePaymentIntentId,
            amount: ctx.totalValue,
            currency: (ctx.currency || "USD").toUpperCase(),
            item_count: itemCount,
            to_phone: ownerPhone,
            body,
            status: "failed",
            attempts: (existing as { attempts?: number } | null)?.attempts
              ? ((existing as { attempts?: number }).attempts ?? 0) + 1
              : 1,
            error_reason: `twilio_${resp.status}: ${json.message ?? "unknown"}`,
          },
          { onConflict: "stripe_session_id", ignoreDuplicates: false },
        );
      await logSmsEvent(supabase, {
        alert_type: "order",
        order_id: ctx.orderId,
        stripe_session_id: ctx.stripeSessionId,
        recipient: ownerPhone,
        body,
        status: "failed",
        error_reason: `twilio_${resp.status}: ${json.message ?? "unknown"}`,
      });
      console.error("[POST-PAY] SMS failed:", resp.status, json);
    }
  } catch (e) {
    console.error("[POST-PAY] SMS exception:", e);
    try {
      await supabase
        .from("order_sms_alerts")
        .upsert(
          {
            order_id: ctx.orderId,
            stripe_session_id: ctx.stripeSessionId,
            stripe_payment_intent_id: ctx.stripePaymentIntentId,
            amount: ctx.totalValue,
            currency: (ctx.currency || "USD").toUpperCase(),
            item_count: itemCount,
            to_phone: ownerPhone ?? null,
            body,
            status: "failed",
            error_reason: (e as Error).message.slice(0, 240),
          },
          { onConflict: "stripe_session_id", ignoreDuplicates: false },
        );
    } catch {
      /* logging only */
    }
  }
}

// ── Aggregate: run every mirror best-effort ─────────────────────────────────
export async function runPostPaymentTracking(
  supabase: SBClient,
  ctx: PostPaymentContext,
): Promise<void> {
  await Promise.allSettled([
    mirrorLpFunnelPurchase(supabase, ctx),
    mirrorVisitorActivityPurchase(supabase, ctx),
    enqueuePinterestPurchaseCapi(supabase, ctx),
    sendOrderSmsAlert(supabase, ctx),
  ]);
}

// ─── Twilio config + low-level send ────────────────────────────────────────
interface TwilioConfig {
  accountSid: string | null;
  authToken: string | null;
  fromNumber: string | null;
  ownerPhone: string | null;
}

export async function loadTwilioConfig(supabase: SBClient): Promise<TwilioConfig> {
  const keys = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "OWNER_ALERT_PHONE",
  ];
  const db: Record<string, string | null> = {};
  try {
    const { data } = await supabase
      .from("admin_secrets")
      .select("name, value")
      .in("name", keys);
    for (const r of data ?? []) {
      db[(r as { name: string }).name] = (r as { value: string }).value;
    }
  } catch (_) { /* ignore */ }
  return {
    accountSid: db.TWILIO_ACCOUNT_SID || Deno.env.get("TWILIO_ACCOUNT_SID") || null,
    authToken: db.TWILIO_AUTH_TOKEN || Deno.env.get("TWILIO_AUTH_TOKEN") || null,
    fromNumber: db.TWILIO_FROM_NUMBER || Deno.env.get("TWILIO_FROM_NUMBER") || null,
    ownerPhone: db.OWNER_ALERT_PHONE || Deno.env.get("OWNER_ALERT_PHONE") || null,
  };
}

async function twilioSendRaw(
  cfg: TwilioConfig,
  body: string,
): Promise<{ ok: boolean; status: number; sid?: string; error?: string }> {
  if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber || !cfg.ownerPhone) {
    return { ok: false, status: 0, error: "missing_config" };
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
  if (resp.ok && j.sid) return { ok: true, status: resp.status, sid: j.sid };
  return { ok: false, status: resp.status, error: `twilio_${resp.status}_${j.code ?? ""}: ${j.message ?? "unknown"}` };
}

async function logSmsEvent(
  supabase: SBClient,
  row: {
    alert_type: string;
    order_id?: string | null;
    stripe_session_id?: string | null;
    recipient?: string | null;
    body?: string | null;
    status: string;
    twilio_message_sid?: string | null;
    error_reason?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("sms_alert_logs").insert(row);
  } catch (e) {
    console.error("[POST-PAY] sms_alert_logs insert failed:", e);
  }
}

async function sendHighValueAlert(
  supabase: SBClient,
  ctx: PostPaymentContext,
  body: string,
  cfg: TwilioConfig,
): Promise<void> {
  try {
    // SMS Mode gate — "high_value" is a non-sale companion alert.
    const gate = await gateAndLog(supabase, "high_value", body, {
      order_id: ctx.orderId,
      stripe_session_id: ctx.stripeSessionId,
      recipient: cfg.ownerPhone,
    });
    if (!gate.allowed) return;
    // Idempotency: one high_value SMS per session.
    const { data: existing } = await supabase
      .from("sms_alert_logs")
      .select("id")
      .eq("alert_type", "high_value")
      .eq("stripe_session_id", ctx.stripeSessionId)
      .eq("status", "sent")
      .maybeSingle();
    if (existing?.id) return;
    const r = await twilioSendRaw(cfg, body);
    await logSmsEvent(supabase, {
      alert_type: "high_value",
      order_id: ctx.orderId,
      stripe_session_id: ctx.stripeSessionId,
      recipient: cfg.ownerPhone,
      body,
      status: r.ok ? "sent" : "failed",
      twilio_message_sid: r.sid ?? null,
      error_reason: r.ok ? null : r.error ?? null,
    });
  } catch (e) {
    console.error("[POST-PAY] high-value alert failed:", e);
  }
}

// ─── Failure alert (system/component errors) ───────────────────────────────
// Throttled to one SMS per (component, error fingerprint) per 30 minutes
// using sms_alert_logs as the dedupe ledger.
export async function sendFailureAlert(
  supabase: SBClient,
  component: string,
  errorMessage: string,
): Promise<void> {
  try {
    // SMS Mode gate — "failure" alerts are blocked in sales_only mode.
    // We still log the attempt so admins can see what would have fired.
    const fingerprintBody = `${component}:${errorMessage.slice(0, 80)}`;
    const gate = await gateAndLog(supabase, "failure", fingerprintBody);
    if (!gate.allowed) return;
    const cfg = await loadTwilioConfig(supabase);
    const fingerprint = `${component}:${errorMessage.slice(0, 80)}`;
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recent } = await supabase
      .from("sms_alert_logs")
      .select("id")
      .eq("alert_type", "failure")
      .eq("status", "sent")
      .eq("body", fingerprint)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (recent?.id) {
      console.log("[POST-PAY] failure alert throttled:", component);
      return;
    }
    const ts = new Date().toISOString();
    const body =
      `🚨 SYSTEM ALERT\n` +
      `Component:\n${component}\n` +
      `Error:\n${errorMessage.slice(0, 240)}\n` +
      `Timestamp:\n${ts}`;
    if (!cfg.accountSid || !cfg.authToken || !cfg.fromNumber || !cfg.ownerPhone) {
      await logSmsEvent(supabase, {
        alert_type: "failure",
        recipient: cfg.ownerPhone,
        body: fingerprint,
        status: "pending_config",
        error_reason: "missing_twilio_config",
      });
      return;
    }
    const r = await twilioSendRaw(cfg, body);
    await logSmsEvent(supabase, {
      alert_type: "failure",
      recipient: cfg.ownerPhone,
      body: fingerprint, // stored as dedupe key
      status: r.ok ? "sent" : "failed",
      twilio_message_sid: r.sid ?? null,
      error_reason: r.ok ? null : r.error ?? null,
    });
  } catch (e) {
    console.error("[POST-PAY] sendFailureAlert exception:", e);
  }
}