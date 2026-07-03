// Admin-only: verify the latest internal Stripe test checkout end-to-end.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const url = new URL(req.url);
    let sessionId = url.searchParams.get("session_id");
    if (!sessionId && req.method === "POST") {
      try { sessionId = (await req.json())?.sessionId ?? null; } catch { /* noop */ }
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE") || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("No Stripe key configured");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // If no sessionId, grab the latest logged test session.
    if (!sessionId) {
      const { data: latest } = await supabaseAdmin
        .from("stripe_test_checkout_log")
        .select("stripe_session_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionId = latest?.stripe_session_id ?? null;
    }
    if (!sessionId) {
      return new Response(JSON.stringify({ ok: false, error: "no_session_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "payment_intent.charges"],
    });
    const pi = session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : null;
    const walletType =
      pi?.charges?.data?.[0]?.payment_method_details?.card?.wallet?.type ?? null;

    // Order lookup by stripe session id.
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, status, total_amount, stripe_session_id, created_at, updated_at")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    // Product still hidden?
    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id, category, is_active")
      .eq("id", "2559507b-2d8c-44c1-9a50-ace931756356")
      .maybeSingle();
    const productHidden = product?.category === "__internal_qa__";

    const paymentSucceeded = session.payment_status === "paid" || pi?.status === "succeeded";
    const orderCreated = !!order;
    const orderPaid = order?.status === "completed" || order?.status === "paid";

    const pass =
      paymentSucceeded &&
      orderCreated &&
      productHidden;

    // Update log status
    await supabaseAdmin
      .from("stripe_test_checkout_log")
      .update({
        status: paymentSucceeded ? "paid" : (session.status ?? "unknown"),
        metadata: {
          verified_at: new Date().toISOString(),
          wallet_type: walletType,
          order_id: order?.id ?? null,
        },
      })
      .eq("stripe_session_id", sessionId);

    return new Response(
      JSON.stringify({
        ok: true,
        verdict: pass ? "PASS" : "FAIL",
        sessionId,
        paymentIntentId: pi?.id ?? null,
        stripeSessionStatus: session.status,
        stripePaymentStatus: session.payment_status,
        paymentIntentStatus: pi?.status ?? null,
        walletType,
        amountTotal: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email ?? null,
        order: order ?? null,
        orderCreated,
        orderPaid,
        productHidden,
        statementDescriptorSuffix: pi?.statement_descriptor_suffix ?? null,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("[admin-stripe-test-verify] error", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error)?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});