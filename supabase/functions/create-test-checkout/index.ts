import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * create-test-checkout
 *
 * Admin-only endpoint that creates a Stripe Checkout session for $0.50 (USD minimum)
 * WITHOUT touching the live product catalog. Used to validate the production
 * webhook + email flow with the smallest possible real charge.
 *
 * - Requires an authenticated admin (role 'admin' in user_roles).
 * - Creates a "pending" order in the orders table so the webhook flow matches
 *   exactly what real orders look like.
 * - Marks the order with metadata.test_payment = "1" so it can be filtered/refunded later.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();

  try {
    // ---- Resolve Stripe key (LIVE preferred, fallback to TEST) ----
    // STRIPE_SECRET_KEY_LIVE is required to actually charge real money.
    // If absent we fall back to STRIPE_SECRET_KEY (test) so the function never crashes.
    const liveKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    const testKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeKey = liveKey || testKey;
    if (!stripeKey) throw new Error("No Stripe secret key configured");

    // Validate prefix so we fail loudly if a publishable / restricted key was pasted.
    const usingLive = !!liveKey;
    if (usingLive && !liveKey!.startsWith("sk_live_")) {
      throw new Error(
        `STRIPE_SECRET_KEY_LIVE must start with sk_live_, got: ${liveKey!.substring(0, 8)}`,
      );
    }
    if (!usingLive && !testKey!.startsWith("sk_test_")) {
      throw new Error(
        `STRIPE_SECRET_KEY must start with sk_test_, got: ${testKey!.substring(0, 8)}`,
      );
    }
    console.log(
      `[CREATE-TEST-CHECKOUT][${traceId}] mode=${usingLive ? "LIVE" : "TEST"} key_prefix=${stripeKey.substring(0, 8)}`,
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // ---- AUTH: require admin ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const user = userData.user;

    // Check admin role via user_roles table
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Parse request body for amount / mode ----
    let body: { amount_cents?: number; currency?: string; validation_run?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const isValidation = body.validation_run === true;
    // Default: €0.50 webhook smoke test. Validation run: $9.99 full funnel purchase event.
    const TEST_AMOUNT_CENTS = isValidation
      ? 999
      : typeof body.amount_cents === "number" && body.amount_cents >= 50
      ? Math.floor(body.amount_cents)
      : 50;
    const TEST_CURRENCY = (body.currency ?? (isValidation ? "usd" : "eur")).toLowerCase();
    const TEST_ITEM_ID = isValidation
      ? "VALIDATION-RUN-999"
      : "TEST-PAYMENT-VALIDATION";
    const TEST_ITEM_NAME = isValidation
      ? "Validation Run — GetPawsy Ecommerce Funnel ($9.99, refundable)"
      : "Test Payment — GetPawsy Validation";
    const amountMajor = TEST_AMOUNT_CENTS / 100;

    // Reuse Stripe customer if exists
    let customerId: string | undefined;
    if (user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) customerId = customers.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: TEST_CURRENCY,
            product_data: {
              name: TEST_ITEM_NAME,
              description:
                isValidation
                  ? "Refundable validation run — full ecommerce funnel + purchase event check. Auto-refundable from /admin/payments."
                  : "Internal test charge to validate webhook flow. Not a real product. Will be refunded.",
              metadata: {
                product_id: TEST_ITEM_ID,
                test_payment: "1",
                validation_run: isValidation ? "1" : "0",
              },
            },
            unit_amount: TEST_AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_method_types: ["card", "link"],
      locale: "en",
      billing_address_collection: "auto",
      // Phone collection disabled across all GetPawsy Checkout sessions
      // (Growth Cycle #1, 2026-06-28).
      phone_number_collection: { enabled: false },
      success_url: `${req.headers.get("origin")}/payment-success?session_id={CHECKOUT_SESSION_ID}&test=1`,
      cancel_url: `${req.headers.get("origin")}/admin/test-payment`,
      metadata: {
        test_payment: "1",
        validation_run: isValidation ? "1" : "0",
        refundable: "1",
        triggered_by: user.email ?? user.id,
        items: JSON.stringify([
          {
            id: TEST_ITEM_ID,
            name: TEST_ITEM_NAME,
            price: amountMajor,
            quantity: 1,
          },
        ]),
        total_items: "1",
        total_value: amountMajor.toFixed(2),
        discount_code: "",
      },
    });

    console.log(`[CREATE-TEST-CHECKOUT][${traceId}] Session created:`, session.id);

    // Create matching pending order so webhook can mark it paid
    const { error: orderError } = await supabaseAdmin.from("orders").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      status: "pending",
      total_amount: amountMajor,
      currency: TEST_CURRENCY,
      customer_email: user.email,
      items: [
        {
          id: TEST_ITEM_ID,
          name: TEST_ITEM_NAME,
          price: amountMajor,
          quantity: 1,
        },
      ],
      order_access_token: null,
    });

    if (orderError) {
      console.error(`[CREATE-TEST-CHECKOUT][${traceId}] Order insert error:`, orderError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        message: "Test checkout session created",
        url: session.url,
        sessionId: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[CREATE-TEST-CHECKOUT][${traceId}] Error:`, message);
    return new Response(
      JSON.stringify({ ok: false, traceId, message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});