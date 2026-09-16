/**
 * M — deterministic order recovery queue (admin/internal only).
 *
 * Scans paid orders whose fulfillment did not complete and turns each into an
 * explicit exception row with a deterministic next action and retry time.
 *
 * It calls NO external service: it never contacts Stripe or the supplier and
 * never places, cancels or refunds anything. Retrying fulfillment is a
 * separate, explicitly triggered step — this function only decides and records.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";
import {
  nextRecoveryAction,
  type FulfillmentStatus,
  type PaymentStatus,
  type RefundState,
} from "../_shared/order-state.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

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
    const limit = Math.min(Number(body?.limit) || 100, 500);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, payment_status, fulfillment_status, refund_state, cj_order_id, total_amount, refunded_amount_cents, fulfillment_attempts, fulfillment_claimed_at, created_at",
      )
      .gte("created_at", since)
      .in("fulfillment_status", ["unfulfilled", "claimed", "failed"])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    const queue: Array<Record<string, unknown>> = [];

    for (const o of orders ?? []) {
      const claimAgeMinutes = o.fulfillment_claimed_at
        ? Math.floor((Date.now() - new Date(o.fulfillment_claimed_at).getTime()) / 60_000)
        : null;

      const decision = nextRecoveryAction({
        paymentStatus: (o.payment_status ?? "unpaid") as PaymentStatus,
        fulfillmentStatus: (o.fulfillment_status ?? "unfulfilled") as FulfillmentStatus,
        refundState: (o.refund_state ?? "none") as RefundState,
        cjOrderId: o.cj_order_id,
        totalCents: Math.round(Number(o.total_amount ?? 0) * 100),
        refundedAmountCents: Number(o.refunded_amount_cents ?? 0),
        claimAgeMinutes,
        fulfillmentAttempts: Number(o.fulfillment_attempts ?? 0),
      });

      if (decision.action === "none") continue;

      queue.push({ orderId: o.id, ...decision });

      if (decision.code) {
        await supabaseAdmin.from("order_exceptions").upsert(
          {
            order_id: o.id,
            code: decision.code,
            detail: `recovery:${decision.action}`,
            state: decision.action === "manual_review" ? "manual" : "retrying",
            attempts: Number(o.fulfillment_attempts ?? 0),
            next_attempt_at: new Date(
              Date.now() + decision.delayMinutes * 60_000,
            ).toISOString(),
          },
          { onConflict: "order_id,code" },
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: orders?.length ?? 0, queued: queue.length, queue }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[ORDER-RECOVERY-QUEUE] Error:", message);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
