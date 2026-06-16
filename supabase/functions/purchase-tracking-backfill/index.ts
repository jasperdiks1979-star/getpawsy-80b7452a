// ─────────────────────────────────────────────────────────────────────────────
// purchase-tracking-backfill
// Admin-only one-shot endpoint that re-runs the post-payment tracking
// mirrors (lp_funnel purchase / visitor_activity / Pinterest CAPI outbox /
// owner SMS) for an existing paid order. Idempotent: every mirror dedupes
// on the Stripe session id, so calling this repeatedly is safe.
//
// POST body: { "stripe_session_id": "cs_live_..." }
// Header:    x-internal-secret: <INTERNAL_FUNCTION_SECRET>
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import {
  runPostPaymentTracking,
  type OrderItem,
} from "../_shared/post-payment-tracking.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);

  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "";
  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!internalSecret || provided !== internalSecret) {
    return json({ ok: false, traceId, message: "unauthorized" }, 401);
  }

  let payload: { stripe_session_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, traceId, message: "invalid_json" }, 400);
  }
  const stripeSessionId = (payload.stripe_session_id ?? "").trim();
  if (!stripeSessionId.startsWith("cs_")) {
    return json({ ok: false, traceId, message: "stripe_session_id required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, stripe_session_id, stripe_payment_intent_id, total_amount, currency, customer_email, items, status",
    )
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  if (error || !order) {
    return json(
      { ok: false, traceId, message: "order_not_found", error: error?.message },
      404,
    );
  }
  if (order.status !== "paid") {
    return json(
      { ok: false, traceId, message: `order_not_paid (${order.status})` },
      409,
    );
  }

  // Coerce items to OrderItem[]
  const rawItems = Array.isArray(order.items) ? order.items : [];
  const items: OrderItem[] = rawItems.map((it: Record<string, unknown>) => ({
    id: typeof it.id === "string" ? it.id : undefined,
    name: typeof it.name === "string" ? it.name : undefined,
    price: typeof it.price === "number" ? it.price : undefined,
    quantity: typeof it.quantity === "number" ? it.quantity : 1,
  }));

  await runPostPaymentTracking(supabase, {
    orderId: order.id,
    stripeSessionId: order.stripe_session_id,
    stripePaymentIntentId: order.stripe_payment_intent_id ?? null,
    totalValue: Number(order.total_amount ?? 0),
    currency: order.currency || "usd",
    items,
    customerEmail: order.customer_email ?? null,
  });

  return json({
    ok: true,
    traceId,
    data: {
      order_id: order.id,
      stripe_session_id: order.stripe_session_id,
      total_amount: order.total_amount,
      currency: order.currency,
      item_count: items.length,
    },
  });
});