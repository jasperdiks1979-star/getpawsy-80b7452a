/**
 * J — authoritative payment verification for the success page.
 *
 * The browser only ever knows a `session_id` from the return URL, which is an
 * unverified query parameter. This function is the ONLY thing allowed to tell
 * the storefront that a payment is confirmed: it reads the session from Stripe
 * server-side and cross-checks the order row.
 *
 * It never triggers fulfillment (that stays webhook-driven) and never charges
 * anything. Its only write is an idempotent reconciliation of a paid payment
 * whose webhook has not landed yet.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { getStripeKey } from "../_shared/stripe-key.ts";
import {
  customerPaymentWording,
  deriveLegacyStatus,
  EXCEPTION_CODES,
  type PaymentStatus,
} from "../_shared/order-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_ID_RE = /^cs_[A-Za-z0-9_]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!SESSION_ID_RE.test(sessionId)) {
      return new Response(
        JSON.stringify({ ok: false, code: "invalid_session_id" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      );
    }

    const { key } = getStripeKey();
    const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

    // Server-side read — the shopper cannot influence this value.
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paymentStatus: PaymentStatus =
      session.payment_status === "paid"
        ? "paid"
        : session.status === "expired"
        ? "expired"
        : session.payment_status === "unpaid" && session.status === "complete"
        ? "pending"
        : "pending";

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, payment_status, fulfillment_status, refund_state, total_amount, currency, customer_email, order_access_token, user_id, items",
      )
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    // ── Reconciliation ─────────────────────────────────────────────────────
    // Stripe says paid but our row does not: the webhook is late or was lost.
    // Recording the paid state here is idempotent and does NOT fulfil — the
    // webhook (or the recovery queue) remains the single fulfillment trigger.
    let reconciled = false;
    if (paymentStatus === "paid" && order && order.payment_status !== "paid") {
      const { error: reconcileError } = await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          status: deriveLegacyStatus({ paymentStatus: "paid", refundState: "none" }),
          stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", order.id)
        .neq("payment_status", "paid");
      reconciled = !reconcileError;
      if (reconcileError) {
        console.error("[VERIFY-PAYMENT] Reconcile failed:", reconcileError.message);
      }
    }

    if (paymentStatus === "paid" && !order) {
      // Paid with no order row at all — explicit exception, never a silent gap.
      console.error("[VERIFY-PAYMENT] Paid session without order row:", sessionId);
      await supabaseAdmin.from("stripe_webhook_events").upsert(
        {
          event_id: `verify:${sessionId}`,
          event_type: EXCEPTION_CODES.PAYMENT_WITHOUT_ORDER,
          stripe_session_id: sessionId,
          status: "needs_review",
        },
        { onConflict: "event_id" },
      );
    }

    const effectivePayment: PaymentStatus = reconciled
      ? "paid"
      : ((order?.payment_status as PaymentStatus | undefined) ?? paymentStatus);

    // ── N-11: minimum safe success-page payload ────────────────────────────
    // Knowing a Stripe session id must NOT unlock guest order access or PII.
    // No access token, no email, no address, no line items — guest tracking
    // stays a separate capability behind /track-order + its own token.
    return new Response(
      JSON.stringify({
        ok: true,
        confirmed: effectivePayment === "paid" && paymentStatus === "paid",
        payment_status: effectivePayment,
        fulfillment_status: order?.fulfillment_status ?? "unfulfilled",
        refund_state: order?.refund_state ?? "none",
        message: customerPaymentWording(effectivePayment),
        order: order
          ? {
            // Short human reference only — not the full order id.
            reference: String(order.id).slice(0, 8).toUpperCase(),
            total_amount: order.total_amount,
            currency: order.currency ?? "usd",
          }
          : null,
        reconciled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[VERIFY-PAYMENT] Error:", message);
    return new Response(
      JSON.stringify({ ok: false, code: "verification_unavailable" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 },
    );
  }
});
