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
  customerName?: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[STRIPE-WEBHOOK] Missing Supabase config for email function");
      return;
    }

    console.log("[STRIPE-WEBHOOK] Sending order confirmation email to:", customerEmail);
    
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

        // Check if order already exists
        const { data: existingOrder } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("stripe_session_id", session.id)
          .single();

        let orderId: string;

        if (existingOrder) {
          orderId = existingOrder.id;
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

        // Send order confirmation email
        if (customerEmail) {
          await sendOrderConfirmationEmail(
            orderId,
            customerEmail,
            items,
            totalValue,
            session.currency || "eur",
            session.shipping_details,
            customerName || undefined
          );
        } else {
          console.warn("[STRIPE-WEBHOOK] No customer email available for confirmation");
        }

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
