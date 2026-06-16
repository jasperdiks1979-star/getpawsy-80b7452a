import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CheckoutRequest {
  items: CartItem[];
  customerEmail?: string;
  discountCode?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

// Coupon code → discount percent. Kept server-side so Stripe is charged
// EXACTLY what the UI displayed (subtotal − tier% − coupon% + shipping).
// Must stay in sync with VALID_DISCOUNT_CODES in src/pages/Checkout.tsx.
const COUPON_CODE_PERCENT: Record<string, number> = {
  WELCOME10: 10,
  DONTGO15: 15,
  BUNDLE10: 10,
  BUNDLE15: 15,
  BUNDLE18: 18,
  BUNDLE20: 20,
  SLOWFEEDER25: 25,
};

// Shipping mirrors src/lib/shipping-constants.ts. Kept inline because edge
// functions cannot import from `src/`.
const FREE_SHIPPING_THRESHOLD = 35;
const FLAT_SHIPPING_RATE_CENTS = 599; // $5.99
const TIERED_INCENTIVES = [
  { threshold: 35, discountPercent: 0 },
  { threshold: 65, discountPercent: 5 },
  { threshold: 99, discountPercent: 10 },
] as const;

function getTierPercent(subtotal: number): number {
  for (let i = TIERED_INCENTIVES.length - 1; i >= 0; i--) {
    if (subtotal >= TIERED_INCENTIVES[i].threshold) return TIERED_INCENTIVES[i].discountPercent;
  }
  return 0;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // PROD: prefer STRIPE_SECRET_KEY_LIVE. Fall back to STRIPE_SECRET_KEY (test).
    // NODE_ENV=production forces LIVE and errors if the live key is missing.
    const nodeEnv = (Deno.env.get("NODE_ENV") || "").toLowerCase();
    const liveKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    const testKey = Deno.env.get("STRIPE_SECRET_KEY");
    const forceLive = nodeEnv === "production";
    const stripeKey = forceLive ? liveKey : (liveKey || testKey);
    if (!stripeKey) {
      throw new Error(
        forceLive
          ? "STRIPE_SECRET_KEY_LIVE is not configured (NODE_ENV=production requires the live key)"
          : "Neither STRIPE_SECRET_KEY_LIVE nor STRIPE_SECRET_KEY is configured",
      );
    }
    const stripeMode: "test" | "live" | "unknown" = stripeKey.startsWith("sk_live_")
      ? "live"
      : stripeKey.startsWith("sk_test_")
        ? "test"
        : "unknown";
    if (forceLive && stripeMode !== "live") {
      throw new Error(`NODE_ENV=production requires sk_live_ key, got prefix: ${stripeKey.substring(0, 8)}`);
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    console.log("[CREATE-CHECKOUT] Stripe mode:", stripeMode, "source:", stripeKey === liveKey ? "LIVE" : "TEST");

    // Create Supabase clients
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Parse request body
    const { items, customerEmail, discountCode, shippingAddress }: CheckoutRequest = await req.json();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

    // ---- SECURITY: never trust client-supplied prices --------------------
    // Validate shape, then re-fetch the canonical price/name/image from the
    // products table using the service-role client. The Stripe line items
    // are built ONLY from DB values; the client `price` field is ignored.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (items.length > 50) {
      throw new Error("Too many items in cart (max 50)");
    }
    for (const it of items) {
      if (!it || typeof it.id !== "string" || !UUID_RE.test(it.id)) {
        throw new Error("Invalid item id");
      }
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 100) {
        throw new Error("Invalid item quantity");
      }
    }
    const productIds = Array.from(new Set(items.map((i) => i.id)));
    const { data: dbProducts, error: dbErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price, image_url, is_active")
      .in("id", productIds);
    if (dbErr) throw new Error(`Product lookup failed: ${dbErr.message}`);
    const productMap = new Map<string, { id: string; name: string; price: number; image_url: string | null; is_active: boolean }>();
    for (const p of dbProducts || []) productMap.set(p.id, p as any);
    for (const it of items) {
      const p = productMap.get(it.id);
      if (!p) throw new Error(`Product not found: ${it.id}`);
      if (p.is_active === false) throw new Error(`Product not available: ${it.id}`);
      if (typeof p.price !== "number" || !(p.price > 0)) throw new Error(`Invalid product price: ${it.id}`);
      // Overwrite client-supplied values with DB canonical values.
      it.price = p.price;
      it.name = p.name;
      it.image = p.image_url || it.image;
    }
    // ----------------------------------------------------------------------

    // Try to get authenticated user (optional for guest checkout)
    let userEmail = customerEmail;
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user?.email) {
        userEmail = data.user.email;
        userId = data.user.id;
      }
    }

    // Check if customer already exists in Stripe
    let customerId: string | undefined;
    if (userEmail) {
      const customers = await stripe.customers.list({ 
        email: userEmail, 
        limit: 1 
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Create line items for Stripe checkout
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
          images: item.image ? [item.image] : undefined,
          metadata: {
            product_id: item.id,
          },
        },
        unit_amount: Math.round(item.price * 100), // Convert to cents
      },
      quantity: item.quantity,
    }));

    // ---- Server-side mirror of Checkout.tsx totals ------------------------
    // Frontend math:
    //   subtotal       = Σ price*qty
    //   tierAmount     = subtotal * tier% / 100
    //   couponAmount   = subtotal * coupon% / 100   (off ORIGINAL subtotal, not post-tier)
    //   shipping       = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT
    //   total          = subtotal − tierAmount − couponAmount + shipping
    // Stripe must charge the same `total`.
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const subtotalCents = items.reduce(
      (sum, i) => sum + Math.round(i.price * 100) * i.quantity,
      0,
    );
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    const normalizedCode = discountCode ? discountCode.toUpperCase().trim() : "";
    const couponPercent = normalizedCode && COUPON_CODE_PERCENT[normalizedCode]
      ? COUPON_CODE_PERCENT[normalizedCode]
      : 0;
    const tierPercent = getTierPercent(subtotal);

    // Combined deduction in cents — applied as ONE Stripe coupon so Stripe
    // can render both lines while charging the exact displayed total.
    const tierDeductionCents = Math.round((subtotalCents * tierPercent) / 100);
    const couponDeductionCents = Math.round((subtotalCents * couponPercent) / 100);
    const totalDeductionCents = Math.min(
      subtotalCents,
      tierDeductionCents + couponDeductionCents,
    );

    const shippingCents = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_RATE_CENTS;
    const expectedTotalCents = subtotalCents - totalDeductionCents + shippingCents;
    const totalAmount = expectedTotalCents / 100;

    // Order metadata for analytics + reconciliation
    const orderMetadata = {
      items: JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))),
      total_items: totalItems.toString(),
      subtotal: (subtotalCents / 100).toFixed(2),
      tier_percent: String(tierPercent),
      tier_amount: (tierDeductionCents / 100).toFixed(2),
      coupon_code: normalizedCode,
      coupon_percent: String(couponPercent),
      coupon_amount: (couponDeductionCents / 100).toFixed(2),
      shipping_amount: (shippingCents / 100).toFixed(2),
      total_value: totalAmount.toFixed(2),
    };

    // Build ONE one-off coupon for the combined deduction so Stripe charges
    // exactly the UI total. Created on every checkout (duration: 'once') —
    // small extra API call, but guarantees parity with the displayed math
    // and avoids stacking-order drift between tier% and coupon%.
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (totalDeductionCents > 0) {
      try {
        const labelParts: string[] = [];
        if (tierPercent > 0) labelParts.push(`Tier ${tierPercent}%`);
        if (couponPercent > 0) labelParts.push(`${normalizedCode} (${couponPercent}%)`);
        const dynamicCoupon = await stripe.coupons.create({
          amount_off: totalDeductionCents,
          currency: "usd",
          duration: "once",
          name: labelParts.join(" + ") || "Order discount",
          metadata: {
            tier_percent: String(tierPercent),
            coupon_code: normalizedCode,
            coupon_percent: String(couponPercent),
            subtotal_cents: String(subtotalCents),
          },
        });
        discounts.push({ coupon: dynamicCoupon.id });
        console.log("[CREATE-CHECKOUT] Discount applied", {
          coupon: dynamicCoupon.id,
          amount_off_cents: totalDeductionCents,
          tier_percent: tierPercent,
          coupon_percent: couponPercent,
        });
      } catch (e) {
        // Don't fail checkout if coupon creation fails — log and continue
        // without discount. Better to capture a sale at full price than to
        // lose it. The mismatch will be visible in `total_value` metadata.
        console.error("[CREATE-CHECKOUT] Failed to create dynamic coupon:", e);
      }
    }

    // Create Stripe checkout session
    // Origin fallback: Origin → Referer → APP_BASE_URL → canonical domain.
    // Eliminates failures from in-app browsers (Pinterest/FB/IG/TikTok) and
    // iOS Safari edge cases that strip the Origin header.
    const rawOrigin = req.headers.get("origin");
    const rawReferer = req.headers.get("referer");
    let baseUrl =
      rawOrigin ||
      (rawReferer ? rawReferer.replace(/^(https?:\/\/[^/]+).*$/, "$1") : "") ||
      Deno.env.get("APP_BASE_URL") ||
      "https://getpawsy.pet";
    try {
      const u = new URL(baseUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
      baseUrl = `${u.protocol}//${u.host}`;
    } catch {
      baseUrl = "https://getpawsy.pet";
    }
    console.log("[CREATE-CHECKOUT] baseUrl:", baseUrl, "origin:", rawOrigin, "referer:", rawReferer);

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: lineItems,
      mode: "payment",
      // NOTE: Do NOT pass `automatic_payment_methods` here — it is a
      // PaymentIntent-only parameter and Stripe rejects the Checkout
      // Session with "Received unknown parameter: automatic_payment_methods".
      // Checkout Sessions automatically surface every method enabled in the
      // Stripe dashboard (Apple Pay, Google Pay, Link, Klarna, Afterpay,
      // Cash App Pay, …) when `payment_method_types` is omitted.
      shipping_address_collection: {
        // US-only storefront: only accept US shipping addresses to prevent
        // accidental international orders we cannot fulfill.
        allowed_countries: ["US"],
      },
      // Show shipping line in Stripe's order summary so the customer sees
      // the same breakdown as the site (subtotal − discount + shipping).
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingCents, currency: "usd" },
            display_name:
              shippingCents === 0
                ? "Free shipping (US)"
                : "Standard shipping (US)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      // Pre-fill phone (helps wallet payments + carrier delivery)
      phone_number_collection: { enabled: true },
      // Locale-tag UI as English for US shoppers
      locale: "en",
      // Improves wallet payments by surfacing it as the express choice
      billing_address_collection: "auto",
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout`,
      metadata: orderMetadata,
      // Never allow promotion codes — discount is already applied as a
      // one-off coupon for the exact UI-displayed amount. Allowing manual
      // codes would stack and undercharge.
      allow_promotion_codes: false,
    };

    // Only add discounts if we have a valid code
    if (discounts.length > 0) {
      sessionConfig.discounts = discounts;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log("[CREATE-CHECKOUT] Session created:", session.id);

    // Generate access token for guest orders (when no userId)
    const generateAccessToken = () => {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    };

    // Only generate access token for guest orders (no authenticated user)
    const orderAccessToken = userId ? null : generateAccessToken();

    // Create pending order in database using service role
    const { error: orderError } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId,
        stripe_session_id: session.id,
        status: "pending",
        total_amount: totalAmount,
        currency: "usd",
        customer_email: userEmail,
        items: items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
        order_access_token: orderAccessToken,
      });

    if (orderError) {
      console.error("[CREATE-CHECKOUT] Error creating order:", orderError);
      // Don't fail the checkout, just log the error
    } else {
      console.log("[CREATE-CHECKOUT] Pending order created for session:", session.id);
    }

    return new Response(
      JSON.stringify({ 
        url: session.url,
        sessionId: session.id,
        mode: stripeMode,
      }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    // deno-lint-ignore no-explicit-any
    const e = error as any;
    console.error("[CREATE-CHECKOUT] Error:", {
      message: errorMessage,
      type: e?.type,
      code: e?.code,
      statusCode: e?.statusCode,
      param: e?.param,
      hasStripeKey: !!Deno.env.get("STRIPE_SECRET_KEY"),
      hasServiceRoleKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    });
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});