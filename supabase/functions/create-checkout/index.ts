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

// Map discount codes to Stripe coupon IDs
const DISCOUNT_CODE_MAP: Record<string, string> = {
  "WELCOME10": "oq9OCWlu",
  "DONTGO15": "dfTnk1lW",
  "BUNDLE10": "BtVGjBLG",
  "BUNDLE15": "HFLKdq0J",
  "BUNDLE18": "HJHBWcew",
  "BUNDLE20": "MhlvpT13",
  "SLOWFEEDER25": "7tjpXiXi",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

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

    // Calculate totals
    const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    // Calculate order metadata for analytics
    const orderMetadata = {
      items: JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))),
      total_items: totalItems.toString(),
      total_value: totalAmount.toFixed(2),
      discount_code: discountCode || "",
    };

    // Prepare discount configuration
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (discountCode) {
      const normalizedCode = discountCode.toUpperCase().trim();
      const couponId = DISCOUNT_CODE_MAP[normalizedCode];
      if (couponId) {
        discounts.push({ coupon: couponId });
        console.log("[CREATE-CHECKOUT] Applying discount code:", normalizedCode, "->", couponId);
      } else {
        console.log("[CREATE-CHECKOUT] Invalid discount code:", normalizedCode);
      }
    }

    // Create Stripe checkout session
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: lineItems,
      mode: "payment",
      // Use automatic_payment_methods so Stripe surfaces every method enabled
      // in the dashboard (Apple Pay, Google Pay, Link, Klarna, Afterpay,
      // Cash App Pay, etc.) — critical for high-ticket TikTok mobile traffic
      // where wallets + BNPL meaningfully lift checkout completion.
      automatic_payment_methods: { enabled: true },
      shipping_address_collection: {
        // US-only storefront: only accept US shipping addresses to prevent
        // accidental international orders we cannot fulfill.
        allowed_countries: ["US"],
      },
      // Pre-fill phone (helps wallet payments + carrier delivery)
      phone_number_collection: { enabled: true },
      // Locale-tag UI as English for US shoppers
      locale: "en",
      // Improves wallet payments by surfacing it as the express choice
      billing_address_collection: "auto",
      success_url: `${req.headers.get("origin")}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/checkout`,
      metadata: orderMetadata,
      allow_promotion_codes: discounts.length === 0, // Allow manual entry if no code pre-applied
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
      }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CREATE-CHECKOUT] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});