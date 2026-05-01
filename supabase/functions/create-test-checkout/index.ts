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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not configured");

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

    // ---- Build minimal test line item ($0.50) ----
    const TEST_AMOUNT_CENTS = 50; // $0.50 — Stripe USD minimum
    const TEST_ITEM_ID = "TEST-PAYMENT-VALIDATION";

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
            currency: "usd",
            product_data: {
              name: "Test Payment — GetPawsy Validation",
              description:
                "Internal test charge to validate webhook flow. Not a real product. Will be refunded.",
              metadata: { product_id: TEST_ITEM_ID, test_payment: "1" },
            },
            unit_amount: TEST_AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_method_types: ["card", "link"],
      shipping_address_collection: { allowed_countries: ["US"] },
      phone_number_collection: { enabled: true },
      locale: "en",
      billing_address_collection: "auto",
      success_url: `${req.headers.get("origin")}/payment-success?session_id={CHECKOUT_SESSION_ID}&test=1`,
      cancel_url: `${req.headers.get("origin")}/admin/test-payment`,
      metadata: {
        test_payment: "1",
        triggered_by: user.email ?? user.id,
        items: JSON.stringify([
          {
            id: TEST_ITEM_ID,
            name: "Test Payment — GetPawsy Validation",
            price: 0.5,
            quantity: 1,
          },
        ]),
        total_items: "1",
        total_value: "0.50",
        discount_code: "",
      },
    });

    console.log(`[CREATE-TEST-CHECKOUT][${traceId}] Session created:`, session.id);

    // Create matching pending order so webhook can mark it paid
    const { error: orderError } = await supabaseAdmin.from("orders").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      status: "pending",
      total_amount: 0.5,
      currency: "usd",
      customer_email: user.email,
      items: [
        {
          id: TEST_ITEM_ID,
          name: "Test Payment — GetPawsy Validation",
          price: 0.5,
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