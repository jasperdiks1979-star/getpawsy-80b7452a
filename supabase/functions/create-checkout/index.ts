import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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

    // Parse request body
    const { items, customerEmail, shippingAddress }: CheckoutRequest = await req.json();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

    // Try to get authenticated user (optional for guest checkout)
    let userEmail = customerEmail;
    const authHeader = req.headers.get("Authorization");
    
    if (authHeader) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? ""
      );
      
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user?.email) {
        userEmail = data.user.email;
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
        currency: "eur",
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

    // Calculate order metadata for analytics
    const orderMetadata = {
      items: JSON.stringify(items.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity }))),
      total_items: items.reduce((sum, i) => sum + i.quantity, 0).toString(),
      total_value: items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2),
    };

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: lineItems,
      mode: "payment",
      shipping_address_collection: {
        allowed_countries: ["NL", "BE", "DE", "FR", "GB", "US"],
      },
      success_url: `${req.headers.get("origin")}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/checkout`,
      metadata: orderMetadata,
    });

    console.log("[CREATE-CHECKOUT] Session created:", session.id);

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
