/**
 * M — refund execution architecture (admin/internal only).
 *
 * SAFETY MODEL — a real refund needs THREE independent conditions:
 *   1. an admin JWT or the internal secret (shared guard),
 *   2. an explicit `confirm: true` in the request body,
 *   3. the environment switch REFUNDS_ENABLED === "true".
 *
 * With any of those missing the function runs in DRY RUN: it validates,
 * writes/updates the refund ledger row in `requested` state and returns the
 * plan. It never calls Stripe. That is the default, so this function cannot
 * move money by accident.
 *
 * Supplier (CJ) cancellation is recorded as an intent only — this function
 * never calls CJ. Customer-facing wording must come from
 * `customerRefundWording`, which never claims an unconfirmed outcome.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";
import { getStripeKey } from "../_shared/stripe-key.ts";
import {
  customerRefundWording,
  deriveLegacyStatus,
  EXCEPTION_CODES,
  refundStateAfter,
  supplierCancellationFor,
  validateRefundRequest,
  type FulfillmentStatus,
  type PaymentStatus,
  type RefundState,
} from "../_shared/order-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const amountCents = Number(body?.amountCents);
    const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : null;
    const confirm = body?.confirm === true;

    if (!orderId) return json({ error: "orderId is required" }, 400);

    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select(
        "id, total_amount, currency, payment_status, status, fulfillment_status, refund_state, refunded_amount_cents, cj_order_id, stripe_payment_intent_id",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) return json({ error: "order_not_found" }, 404);

    const totalCents = Math.round(Number(order.total_amount ?? 0) * 100);
    const alreadyRefunded = Number(order.refunded_amount_cents ?? 0);
    const requestedCents = Number.isFinite(amountCents) && amountCents > 0
      ? Math.round(amountCents)
      : totalCents - alreadyRefunded;

    const snapshot = {
      paymentStatus: (order.payment_status ?? order.status) as PaymentStatus,
      fulfillmentStatus: (order.fulfillment_status ?? "unfulfilled") as FulfillmentStatus,
      refundState: (order.refund_state ?? "none") as RefundState,
      cjOrderId: order.cj_order_id,
      totalCents,
      refundedAmountCents: alreadyRefunded,
    };

    const validation = validateRefundRequest({ order: snapshot, amountCents: requestedCents });
    if (!validation.ok) {
      return json({ error: validation.reason, orderId, requestedCents }, 409);
    }

    const supplierState = supplierCancellationFor(snapshot);
    const idempotencyKey = `refund:${orderId}:${requestedCents}:${alreadyRefunded}`;
    const refundsEnabled = (Deno.env.get("REFUNDS_ENABLED") ?? "").toLowerCase() === "true";
    const dryRun = !confirm || !refundsEnabled;

    // Ledger row first — a refund intent is always recorded before any money moves.
    const { data: ledgerRow, error: ledgerError } = await supabaseAdmin
      .from("order_refunds")
      .upsert(
        {
          order_id: orderId,
          idempotency_key: idempotencyKey,
          stripe_payment_intent_id: order.stripe_payment_intent_id,
          amount_cents: requestedCents,
          currency: order.currency ?? "usd",
          kind: validation.kind,
          state: "requested",
          reason,
          supplier_cancellation_state: supplierState,
          notes: dryRun ? "dry_run" : null,
        },
        { onConflict: "idempotency_key" },
      )
      .select("id, state")
      .maybeSingle();

    if (ledgerError) {
      console.error("[ADMIN-REFUND] Ledger write failed:", ledgerError.message);
      return json({ error: "ledger_write_failed" }, 500);
    }

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        reason: !refundsEnabled ? "refunds_disabled" : "confirm_required",
        plan: {
          orderId,
          amountCents: requestedCents,
          kind: validation.kind,
          supplierCancellation: supplierState,
          refundLedgerId: ledgerRow?.id ?? null,
        },
        customerWording: customerRefundWording("refund_requested"),
      });
    }

    // ── Real execution path (only with all three conditions satisfied) ──────
    if (!order.stripe_payment_intent_id) {
      return json({ error: "missing_payment_intent" }, 409);
    }

    const { key } = getStripeKey();
    const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id,
          amount: requestedCents,
          reason: "requested_by_customer",
          metadata: { order_id: orderId },
        },
        { idempotencyKey },
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "refund_failed";
      await supabaseAdmin
        .from("order_refunds")
        .update({ state: "failed", failure_message: message.slice(0, 500) })
        .eq("idempotency_key", idempotencyKey);
      await supabaseAdmin.from("order_exceptions").upsert(
        {
          order_id: orderId,
          code: EXCEPTION_CODES.REFUND_FAILED,
          detail: message.slice(0, 500),
          state: "open",
        },
        { onConflict: "order_id,code" },
      );
      // Order state is NOT advanced — a failed refund never reads as refunded.
      return json({ error: "refund_failed", message, customerWording: customerRefundWording("refund_failed") }, 502);
    }

    const succeeded = refund.status === "succeeded";
    const refundedTotal = alreadyRefunded + (succeeded ? requestedCents : 0);
    const nextRefundState = refundStateAfter({
      previous: snapshot.refundState,
      succeeded,
      refundedTotalCents: refundedTotal,
      orderTotalCents: totalCents,
    });

    await supabaseAdmin
      .from("order_refunds")
      .update({
        stripe_refund_id: refund.id,
        state: succeeded ? "succeeded" : "pending",
        external_confirmed_at: succeeded ? new Date().toISOString() : null,
      })
      .eq("idempotency_key", idempotencyKey);

    await supabaseAdmin
      .from("orders")
      .update({
        refund_state: nextRefundState,
        refunded_amount_cents: refundedTotal,
        status: deriveLegacyStatus({ paymentStatus: "paid", refundState: nextRefundState }),
      })
      .eq("id", orderId);

    return json({
      ok: true,
      dryRun: false,
      refundId: refund.id,
      state: succeeded ? "succeeded" : "pending",
      kind: validation.kind,
      refundState: nextRefundState,
      supplierCancellation: supplierState,
      customerWording: customerRefundWording(succeeded ? nextRefundState : "refund_requested"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ADMIN-REFUND] Error:", message);
    return json({ error: message }, 500);
  }
});
