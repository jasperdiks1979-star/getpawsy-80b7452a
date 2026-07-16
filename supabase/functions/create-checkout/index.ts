import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { sendGa4BeginCheckoutMp } from "../_shared/ga4-measurement-protocol.ts";

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
  /**
   * ISO-3166 alpha-2 of the destination. When present, the request is
   * validated against the CJ shipping matrix and Stripe's allowed_countries
   * is locked to this single code so the shopper can't change it on the
   * hosted page.
   */
  shippingCountry?: string;
  shippingAddress?: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  /**
   * GA4 client id (gtag get … client_id) captured in the browser.
   * Stamped into Stripe session metadata so the webhook can fire a
   * server-side `purchase` event via Measurement Protocol if the client
   * `trackPurchase` misses (refresh / clearCart / ad-blocker).
   */
  gaClientId?: string;
  gaSessionId?: string;
  /** Attribution context captured at PDP / cart. */
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
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

// ---- CJ shipping matrix (mirror of src/lib/cj-shipping-matrix.ts) -------
// Keep in sync. Edge functions can't import from `src/`.
type WarehouseCode = "US" | "CN" | "DE" | "UNKNOWN";
const CJ_SHIP_SUPPORTED_COUNTRIES = new Set<string>([
  "US", "CA", "GB", "NL", "BE", "DE", "FR", "AU",
]);
const CJ_MATRIX: Record<WarehouseCode, Record<string, boolean>> = {
  US:      { US: true, CA: true },
  DE:      { US: true, CA: true, GB: true, NL: true, BE: true, DE: true, FR: true },
  CN:      { US: true, CA: true, GB: true, NL: true, BE: true, DE: true, FR: true, AU: true },
  UNKNOWN: { US: true, CA: true, GB: true, NL: true, BE: true, DE: true, FR: true, AU: true },
};
function normWarehouse(raw: string | null | undefined): WarehouseCode {
  const v = (raw || "").trim().toUpperCase();
  if (v === "US") return "US";
  if (v === "CN") return "CN";
  if (v === "DE") return "DE";
  return "UNKNOWN";
}
function cjCanShip(warehouse: string | null | undefined, country: string): boolean {
  return CJ_MATRIX[normWarehouse(warehouse)][country] === true;
}

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
    // DETERMINISTIC KEY SELECTION:
    //   If STRIPE_SECRET_KEY_LIVE exists → ALWAYS use it (live).
    //   Else fall back to STRIPE_SECRET_KEY (test).
    // STRIPE_MODE env var ("live"/"test") can force a mode for emergency rollback.
    const liveKey = Deno.env.get("STRIPE_SECRET_KEY_LIVE");
    const testKey = Deno.env.get("STRIPE_SECRET_KEY");
    const modeOverride = (Deno.env.get("STRIPE_MODE") || "").toLowerCase();
    let stripeKey: string | undefined;
    if (modeOverride === "test") stripeKey = testKey;
    else if (modeOverride === "live") stripeKey = liveKey;
    else stripeKey = liveKey || testKey;
    if (!stripeKey) {
      throw new Error("No Stripe key configured (STRIPE_SECRET_KEY_LIVE or STRIPE_SECRET_KEY)");
    }
    const stripeMode: "test" | "live" | "unknown" = stripeKey.startsWith("sk_live_")
      ? "live"
      : stripeKey.startsWith("sk_test_")
        ? "test"
        : "unknown";
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    console.log("[CREATE-CHECKOUT] Stripe mode:", stripeMode, "override:", modeOverride || "(none)");

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
    const {
      items,
      customerEmail,
      discountCode,
      shippingAddress,
      shippingCountry,
      gaClientId,
      gaSessionId,
      utm,
    }: CheckoutRequest = await req.json();
    const destinationCountry = (shippingCountry || shippingAddress?.country || "")
      .toUpperCase()
      .trim();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

    // ---- SECURITY: never trust client-supplied prices --------------------
    // Validate shape, then re-fetch the canonical price/name/image from the
    // products table using the service-role client. The Stripe line items
    // are built ONLY from DB values; the client `price` field is ignored.
    // Cart rows for variant SKUs are keyed as `${uuid}-${vid}` or
    // `${uuid}_${vid}` (see ProductDetail.tsx / BestsellerDetail.tsx). We
    // accept that and extract the canonical UUID prefix for the DB lookup.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const UUID_PREFIX_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[_-].+)?$/i;
    const extractProductId = (raw: unknown): string | null => {
      if (typeof raw !== "string") return null;
      const m = raw.match(UUID_PREFIX_RE);
      return m ? m[1].toLowerCase() : null;
    };
    if (items.length > 50) {
      throw new Error("Too many items in cart (max 50)");
    }
    for (const it of items) {
      const productId = it ? extractProductId(it.id) : null;
      if (!productId) {
        console.error("[CREATE-CHECKOUT] Invalid item id:", it?.id);
        throw new Error("Invalid item id");
      }
      // Normalize: downstream lookup + Stripe metadata use the canonical UUID
      it.id = productId;
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 100) {
        throw new Error("Invalid item quantity");
      }
    }
    const productIds = Array.from(new Set(items.map((i) => i.id)));
    const { data: dbProducts, error: dbErr } = await supabaseAdmin
      .from("products")
      .select("id, name, price, image_url, is_active, supplier_warehouse")
      .in("id", productIds);
    if (dbErr) throw new Error(`Product lookup failed: ${dbErr.message}`);
    const productMap = new Map<string, { id: string; name: string; price: number; image_url: string | null; is_active: boolean; supplier_warehouse: string | null }>();
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
    // ---- CJ shipping pre-check ------------------------------------------
    // If the caller declared a destination, every cart product must be
    // fulfillable from its CJ warehouse to that country.
    if (destinationCountry) {
      if (!CJ_SHIP_SUPPORTED_COUNTRIES.has(destinationCountry)) {
        return new Response(
          JSON.stringify({
            error: `We don't ship to ${destinationCountry} yet.`,
            code: "country_not_supported",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
      const blocked: { id: string; name: string; warehouse: string | null }[] = [];
      for (const it of items) {
        const p = productMap.get(it.id)!;
        if (!cjCanShip(p.supplier_warehouse, destinationCountry)) {
          blocked.push({ id: p.id, name: p.name, warehouse: p.supplier_warehouse });
        }
      }
      if (blocked.length > 0) {
        console.warn("[CREATE-CHECKOUT] CJ shipping blocked", { destinationCountry, blocked });
        return new Response(
          JSON.stringify({
            error: `Some items can't ship to ${destinationCountry}.`,
            code: "cj_shipping_unavailable",
            blocked,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }
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
    // Guard: tiered incentive is a VOLUME discount. It must never apply
    // when the shopper has only a single unit in the cart, regardless of
    // subtotal. Fixes the qty=1 / $268.99 / 10% off leak observed in
    // session cs_live_a1jDugDcHJDz5udTQgKuYk3dwt0GLipTCPkfhuXpoJXDNn1ZfpVs1kbXrA.
    const tierPercent = totalItems >= 2 ? getTierPercent(subtotal) : 0;

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
      // ── Conversion Reality / GA4 server-side fallback ──
      ga_client_id: (gaClientId || "").slice(0, 100),
      ga_session_id: (gaSessionId || "").slice(0, 100),
      utm_source: (utm?.source || "").slice(0, 100),
      utm_medium: (utm?.medium || "").slice(0, 100),
      utm_campaign: (utm?.campaign || "").slice(0, 100),
      utm_content: (utm?.content || "").slice(0, 100),
      utm_term: (utm?.term || "").slice(0, 100),
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
        // When the frontend pre-check selected a single destination, lock
        // Stripe to just that country so the shopper can't pick an
        // unfulfillable address on the hosted page. Otherwise fall back to
        // the curated CJ-supported list. Sanctioned/high-risk countries
        // (Iran, North Korea, Syria, Cuba, Russia, Belarus, Crimea/Donetsk
        // /Luhansk, Venezuela, Myanmar, etc.) are excluded.
        allowed_countries: destinationCountry
          ? [destinationCountry as any]
          : [
          // North America
          "US", "CA", "MX",
          // United Kingdom & Ireland
          "GB", "IE",
          // EU / EEA
          "NL", "BE", "LU", "DE", "FR", "ES", "IT", "AT", "PT",
          "SE", "DK", "NO", "FI", "IS", "PL", "CZ", "SK", "HU",
          "SI", "EE", "LV", "LT", "GR", "RO", "BG", "HR",
          // Switzerland & other Europe
          "CH", "LI",
          // Asia-Pacific
          "JP", "KR", "SG", "HK", "TW", "MY", "TH", "PH", "ID", "IN",
          "AU", "NZ",
          // Middle East
          "AE", "SA", "IL", "QA", "KW", "BH", "OM",
          // LATAM (Stripe-supported)
          "BR", "CL", "CO", "PE", "UY", "CR",
          // Africa (Stripe-supported)
          "ZA",
        ],
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
                ? "Free shipping"
                : "Standard shipping",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 5 },
              maximum: { unit: "business_day", value: 10 },
            },
          },
        },
      ],
      // Phone collection DISABLED (Growth Cycle #1, 2026-06-28).
      // Evidence: 13/13 real USD Stripe sessions expired in last 30d; 100%
      // mobile traffic. Baymard: each required Checkout field ≈ 7% abandon.
      // Wallet payments (Apple/Google Pay/Link) still capture phone when
      // the wallet provides it; CJ fulfillment does not require phone.
      // Rollback: set { enabled: true }.
      phone_number_collection: { enabled: false },
      // Locale-tag UI as English for US shoppers
      locale: "en",
      // Improves wallet payments by surfacing it as the express choice
      billing_address_collection: "auto",
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout`,
      metadata: orderMetadata,
    };

    // ─── Checkout Trust & Recovery (Genesis Ω∞) ────────────────────────
    // 1. Persist a Stripe Customer for every session — enables Stripe's
    //    hosted recovery email + branded receipts even for guests.
    // 2. Turn on abandoned-checkout recovery: Stripe emails the shopper
    //    a resume-link when the session expires (24h TTL). Zero code
    //    fallback for the 100% checkout abandonment we've measured.
    // 3. Auto-generate a branded PDF invoice attached to the receipt.
    // 4. Reinforce trust inside Stripe's hosted UI with custom copy
    //    beside the pay button + short T&Cs message. These render as
    //    grey helper text under the summary, not as a modal.
    sessionConfig.customer_creation = customerId ? undefined : "always";
    sessionConfig.after_expiration = {
      recovery: { enabled: true, allow_promotion_codes: false },
    };
    sessionConfig.invoice_creation = {
      enabled: true,
      invoice_data: {
        description: "GetPawsy order",
        footer: "GetPawsy · 30-day money-back guarantee · support@getpawsy.pet",
        metadata: { brand: "GetPawsy" },
      },
    };
    sessionConfig.custom_text = {
      submit: {
        message:
          "Secure checkout by Stripe. Backed by our 30-day money-back guarantee. Shipping options and estimated delivery are shown at checkout.",
      },
      shipping_address: {
        message: "Shipping options and estimated delivery are shown at checkout. Free shipping on orders $35+.",
      },
    };
    // Payment-intent description shows on the Stripe receipt & dashboard.
    sessionConfig.payment_intent_data = {
      description: `GetPawsy order`,
      metadata: { brand: "GetPawsy" },
      // Bank/card statement descriptor. Prefix comes from the Stripe account
      // (Dashboard → Public business name); this suffix is the per-order tail
      // so shoppers recognize the charge as GetPawsy even if the account
      // prefix hasn't been updated from "Skidzo" yet.
      statement_descriptor_suffix: "GETPAWSY",
    };

    // Only add discounts if we have a valid code.
    // Stripe rejects sessions that set BOTH `discounts` and
    // `allow_promotion_codes` — so we set `allow_promotion_codes:false`
    // ONLY when no server-applied discount is attached.
    if (discounts.length > 0) {
      sessionConfig.discounts = discounts;
    } else {
      sessionConfig.allow_promotion_codes = false;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log("[CREATE-CHECKOUT] Session created:", session.id);

    // ── Server-side GA4 mirror of `begin_checkout` ─────────────────────
    // Fires to the canonical GA4 stream via Measurement Protocol so the
    // funnel reconciles even when the client gtag event is blocked. Uses
    // the Stripe session id as the deterministic event id so GA4 dedupes
    // client + server events when they share client_id/session_id.
    try {
      const mp = await sendGa4BeginCheckoutMp({
        clientId: gaClientId || null,
        sessionId: gaSessionId || null,
        checkoutSessionId: session.id,
        value: totalAmount,
        currency: "usd",
        items: items.map((i) => ({
          id: i.id, name: i.name, price: i.price, quantity: i.quantity,
        })),
        source: utm?.source ?? null,
        medium: utm?.medium ?? null,
        campaign: utm?.campaign ?? null,
      });
      if (!mp.ok) {
        console.warn("[CREATE-CHECKOUT] GA4 MP begin_checkout skipped", mp);
      }
    } catch (e) {
      // Never let analytics fail checkout.
      console.warn("[CREATE-CHECKOUT] GA4 MP begin_checkout threw", e);
    }

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