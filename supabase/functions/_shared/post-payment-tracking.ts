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
  // Prefer DB-managed secrets (admin UI), fall back to env vars.
  const keys = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "OWNER_ALERT_PHONE",
  ];
  const dbSecrets: Record<string, string | null> = {};
  try {
    const { data } = await supabase
      .from("admin_secrets")
      .select("name, value")
      .in("name", keys);
    for (const r of data ?? []) {
      dbSecrets[(r as { name: string }).name] = (r as { value: string }).value;
    }
  } catch (_) { /* ignore */ }
  const accountSid = dbSecrets.TWILIO_ACCOUNT_SID || Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = dbSecrets.TWILIO_AUTH_TOKEN || Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = dbSecrets.TWILIO_FROM_NUMBER || Deno.env.get("TWILIO_FROM_NUMBER");
  const ownerPhone = dbSecrets.OWNER_ALERT_PHONE || Deno.env.get("OWNER_ALERT_PHONE");

  const itemCount = ctx.items.reduce((s, it) => s + (it.quantity ?? 1), 0) || 1;
  const shortSid = ctx.stripeSessionId.slice(0, 14);
  const body =
    `GetPawsy order ✅ ${ctx.totalValue.toFixed(2)} ` +
    `${(ctx.currency || "USD").toUpperCase()} - ${itemCount} item(s) - ` +
    `Stripe: ${shortSid}`;

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
      console.warn("[POST-PAY] SMS pending_config — missing:", missing);
      return;
    }

    // Direct Twilio REST (no gateway dependency).
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const form = new URLSearchParams({
      To: ownerPhone,
      From: fromNumber,
      Body: body,
    });
    const auth = btoa(`${accountSid}:${authToken}`);
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const json: { sid?: string; message?: string; code?: number } = await resp
      .json()
      .catch(() => ({}));

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
      console.log("[POST-PAY] SMS sent:", json.sid);
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