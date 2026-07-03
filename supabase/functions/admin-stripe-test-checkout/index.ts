// Admin-only: create a $0.50 LIVE Stripe Checkout Session for internal QA
// (no shipping / no address / wallet-friendly). Rate limited to 3/day per admin.
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

const TEST_PRODUCT_ID = "2559507b-2d8c-44c1-9a50-ace931756356";
const TEST_PRODUCT_SLUG = "internal-stripe-production-test-do-not-index";
const TEST_PRODUCT_NAME = "Stripe Production Test";
const TEST_PRODUCT_PRICE_CENTS = 50; // $0.50
const DAILY_LIMIT = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  try {
    const liveKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    const testKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeKey = liveKey || testKey;
    if (!stripeKey) throw new Error("No Stripe key configured");
    const stripeMode = stripeKey.startsWith("sk_live_") ? "live" : "test";
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Identify admin from JWT (guard already validated).
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: authData } = await anonClient.auth.getUser();
    const adminUserId = authData?.user?.id ?? null;
    const adminEmail = authData?.user?.email ?? null;

    // Rate limit: max 3 live test checkouts per admin per 24h.
    if (adminUserId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("stripe_test_checkout_log")
        .select("id", { count: "exact", head: true })
        .eq("admin_user_id", adminUserId)
        .gte("created_at", since);
      if ((count ?? 0) >= DAILY_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Daily limit of ${DAILY_LIMIT} live test checkouts reached. Try again in 24h.`,
            code: "rate_limited",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Ensure the hidden QA product exists and is purchasable.
    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id, price, is_active, stock, us_stock, category, slug")
      .eq("id", TEST_PRODUCT_ID)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("products").insert({
        id: TEST_PRODUCT_ID,
        slug: TEST_PRODUCT_SLUG,
        name: TEST_PRODUCT_NAME,
        price: 0.5,
        stock: 999,
        us_stock: 999,
        is_active: true,
        category: "__internal_qa__",
      });
    } else {
      await supabaseAdmin
        .from("products")
        .update({
          price: 0.5,
          stock: 999,
          us_stock: 999,
          is_active: true,
          category: "__internal_qa__",
        })
        .eq("id", TEST_PRODUCT_ID);
    }

    // Build a shipping-free Checkout Session so Apple Pay / Google Pay / Link
    // work with a single tap (no address / no ZIP). Live mode is clearly
    // labelled in the product name + description.
    const rawOrigin = req.headers.get("origin");
    const rawReferer = req.headers.get("referer");
    let baseUrl =
      rawOrigin ||
      (rawReferer ? rawReferer.replace(/^(https?:\/\/[^/]+).*$/, "$1") : "") ||
      Deno.env.get("APP_BASE_URL") ||
      "https://getpawsy.pet";
    try {
      const u = new URL(baseUrl);
      baseUrl = `${u.protocol}//${u.host}`;
    } catch {
      baseUrl = "https://getpawsy.pet";
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: adminEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: TEST_PRODUCT_PRICE_CENTS,
            product_data: {
              name: "LIVE TEST — GetPawsy Stripe QA ($0.50)",
              description:
                "Internal live-mode QA charge. Real card. No shipping. Refundable.",
              metadata: {
                product_id: TEST_PRODUCT_ID,
                internal_qa: "true",
              },
            },
          },
          quantity: 1,
        },
      ],
      // NO shipping_address_collection, NO shipping_options → wallet 1-tap.
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      locale: "en",
      allow_promotion_codes: false,
      success_url: `${baseUrl}/admin/stripe-test-checkout?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${baseUrl}/admin/stripe-test-checkout?status=cancel`,
      payment_intent_data: {
        description: "GetPawsy LIVE TEST — internal QA",
        statement_descriptor_suffix: "GETPAWSY QA",
        metadata: {
          brand: "GetPawsy",
          internal_qa: "true",
          admin_user_id: adminUserId ?? "",
          admin_email: adminEmail ?? "",
        },
      },
      metadata: {
        internal_qa: "true",
        test_kind: "stripe_live_test_checkout",
        admin_email: adminEmail ?? "",
      },
    });

    await supabaseAdmin.from("stripe_test_checkout_log").insert({
      admin_user_id: adminUserId,
      admin_email: adminEmail,
      stripe_session_id: session.id,
      stripe_mode: stripeMode,
      amount_cents: TEST_PRODUCT_PRICE_CENTS,
      currency: "usd",
      checkout_url: session.url,
      product_id: TEST_PRODUCT_ID,
      status: "created",
      metadata: { origin: rawOrigin, referer: rawReferer },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        mode: stripeMode,
        sessionId: session.id,
        url: session.url,
        amountCents: TEST_PRODUCT_PRICE_CENTS,
        warning: stripeMode === "live" ? "LIVE TEST PAYMENT — real charge" : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    console.error("[admin-stripe-test-checkout] error", e);
    return new Response(
      JSON.stringify({ error: (e as Error)?.message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});