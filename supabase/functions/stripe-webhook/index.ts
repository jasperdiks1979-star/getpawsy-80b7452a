import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Helper function to send order confirmation email
async function sendOrderConfirmationEmail(
  orderId: string,
  customerEmail: string,
  items: any[],
  totalAmount: number,
  currency: string,
  shippingAddress: any,
  customerName?: string,
  orderAccessToken?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[STRIPE-WEBHOOK] Missing Supabase config for email function");
      return;
    }

    console.log("[STRIPE-WEBHOOK] Sending order confirmation email to:", customerEmail);
    console.log("[STRIPE-WEBHOOK] Including access token for tracking:", !!orderAccessToken);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        orderId,
        customerEmail,
        customerName,
        items,
        totalAmount,
        currency,
        shippingAddress,
        orderAccessToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[STRIPE-WEBHOOK] Failed to send confirmation email:", errorText);
    } else {
      console.log("[STRIPE-WEBHOOK] Order confirmation email sent successfully");
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error sending confirmation email:", error);
  }
}

// Helper function to create CJ Dropshipping order
async function createCJDropshippingOrder(orderId: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[STRIPE-WEBHOOK] Missing Supabase config for CJ order");
      return;
    }

    console.log("[STRIPE-WEBHOOK] Creating CJ Dropshipping order for:", orderId);
    
    const response = await fetch(`${supabaseUrl}/functions/v1/create-cj-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[STRIPE-WEBHOOK] Failed to create CJ order:", errorText);
    } else {
      const result = await response.json();
      console.log("[STRIPE-WEBHOOK] CJ order created successfully:", result.cjOrderId);
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error creating CJ order:", error);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  if (!stripeKey || !webhookSecret) {
    console.error("[STRIPE-WEBHOOK] Missing required environment variables");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2025-08-27.basil",
  });

  // Create Supabase client with service role for webhook operations
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("[STRIPE-WEBHOOK] No signature provided");
      return new Response(
        JSON.stringify({ error: "No signature provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error("[STRIPE-WEBHOOK] Signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    console.log("[STRIPE-WEBHOOK] Event received:", event.type, event.id);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[STRIPE-WEBHOOK] Checkout session completed:", session.id);

        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerName = session.customer_details?.name;
        const items = session.metadata?.items ? JSON.parse(session.metadata.items) : [];
        const totalValue = session.metadata?.total_value ? parseFloat(session.metadata.total_value) : (session.amount_total || 0) / 100;

        // Check if order already exists and get access token
        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id, order_access_token, user_id")
          .eq("stripe_session_id", session.id)
          .single();

        let orderId: string;
        let orderAccessToken: string | null = null;

        if (existingOrder) {
          orderId = existingOrder.id;
          // Only use access token for guest orders (no user_id)
          orderAccessToken = existingOrder.user_id ? null : existingOrder.order_access_token;
          
          // Update existing order to paid
          const { error: updateError } = await supabaseAdmin
            .from("orders")
            .update({
              status: "paid",
              stripe_payment_intent_id: session.payment_intent as string,
              shipping_address: session.shipping_details,
            })
            .eq("stripe_session_id", session.id);

          if (updateError) {
            console.error("[STRIPE-WEBHOOK] Error updating order:", updateError);
          } else {
            console.log("[STRIPE-WEBHOOK] Order updated to paid:", existingOrder.id);
          }
        } else {
          // Generate access token for guest orders created via webhook
          const generateAccessToken = () => {
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
          };
          
          // Guest order (no user_id) - generate access token
          orderAccessToken = generateAccessToken();
          
          // Create new order from webhook data
          const { data: newOrder, error: insertError } = await supabaseAdmin
            .from("orders")
            .insert({
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string,
              status: "paid",
              total_amount: totalValue,
              currency: session.currency || "eur",
              customer_email: customerEmail,
              shipping_address: session.shipping_details,
              items: items,
              order_access_token: orderAccessToken,
            })
            .select("id")
            .single();

          if (insertError) {
            console.error("[STRIPE-WEBHOOK] Error creating order:", insertError);
            orderId = session.id; // Fallback to session id
          } else {
            console.log("[STRIPE-WEBHOOK] Order created from webhook:", newOrder?.id);
            orderId = newOrder?.id || session.id;
          }
        }

        // Send order confirmation email with access token for guest orders
        if (customerEmail) {
          await sendOrderConfirmationEmail(
            orderId,
            customerEmail,
            items,
            totalValue,
            session.currency || "eur",
            session.shipping_details,
            customerName || undefined,
            orderAccessToken || undefined
          );
        } else {
          console.warn("[STRIPE-WEBHOOK] No customer email available for confirmation");
        }

        // Create CJ Dropshipping order automatically after successful payment
        await createCJDropshippingOrder(orderId);

        break;
      }

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("[STRIPE-WEBHOOK] Checkout session expired:", session.id);

        const { error } = await supabaseAdmin
          .from("orders")
          .update({ status: "expired" })
          .eq("stripe_session_id", session.id);

        if (error) {
          console.error("[STRIPE-WEBHOOK] Error updating expired order:", error);
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("[STRIPE-WEBHOOK] Payment intent succeeded:", paymentIntent.id);

        // Update order status if we have the payment intent
        const { error } = await supabaseAdmin
          .from("orders")
          .update({ status: "paid" })
          .eq("stripe_payment_intent_id", paymentIntent.id);

        if (error) {
          console.error("[STRIPE-WEBHOOK] Error updating order by payment intent:", error);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log("[STRIPE-WEBHOOK] Payment intent failed:", paymentIntent.id);

        const { error } = await supabaseAdmin
          .from("orders")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", paymentIntent.id);

        if (error) {
          console.error("[STRIPE-WEBHOOK] Error updating failed order:", error);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        console.log("[STRIPE-WEBHOOK] Charge refunded:", charge.id);

        if (charge.payment_intent) {
          const { error } = await supabaseAdmin
            .from("orders")
            .update({ status: "refunded" })
            .eq("stripe_payment_intent_id", charge.payment_intent as string);

          if (error) {
            console.error("[STRIPE-WEBHOOK] Error updating refunded order:", error);
          }
        }
        break;
      }

      default:
        console.log("[STRIPE-WEBHOOK] Unhandled event type:", event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[STRIPE-WEBHOOK] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
