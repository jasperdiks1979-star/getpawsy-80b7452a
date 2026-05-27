import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";
import { sendTikTokServerEvent } from "../_shared/tiktok-events-api.ts";

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
        "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
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

// Helper function to send admin notification email
async function sendAdminOrderNotification(
  orderId: string,
  customerEmail: string,
  customerName: string | undefined,
  items: any[],
  totalAmount: number,
  currency: string,
  shippingAddress: any
): Promise<void> {
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = "support@getpawsy.pet";
    
    if (!resendApiKey) {
      console.error("[STRIPE-WEBHOOK] Missing RESEND_API_KEY for admin notification");
      return;
    }

    console.log("[STRIPE-WEBHOOK] Sending admin notification email to:", adminEmail);

    const itemsList = items.map((item: any) => 
      `• ${item.name} (${item.quantity}x) - $${(item.price * item.quantity).toFixed(2)}`
    ).join('\n');

    const addressText = shippingAddress?.address ? 
      `${shippingAddress.name || customerName || 'Onbekend'}
${shippingAddress.address.line1 || ''}
${shippingAddress.address.line2 || ''}
${shippingAddress.address.postal_code || ''} ${shippingAddress.address.city || ''}
${shippingAddress.address.country || ''}` : 'Geen adres beschikbaar';

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pawsy Orders <alerts@getpawsy.pet>",
        to: [adminEmail],
        subject: `🛒 New order #${orderId.slice(0, 8)} - $${totalAmount.toFixed(2)}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #10B981;">🎉 Nieuwe bestelling ontvangen!</h1>
            
            <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin-top: 0;">Bestellingsgegevens</h2>
              <p><strong>Order ID:</strong> ${orderId}</p>
              <p><strong>Total:</strong> $${totalAmount.toFixed(2)} ${currency.toUpperCase()}</p>
              <p><strong>Klant:</strong> ${customerName || 'Onbekend'}</p>
              <p><strong>Email:</strong> ${customerEmail}</p>
            </div>
            
            <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin-top: 0;">Producten</h2>
              <pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${itemsList}</pre>
            </div>
            
            <div style="background: #E0E7FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="margin-top: 0;">Verzendadres</h2>
              <pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${addressText}</pre>
            </div>
            
            <p style="color: #6B7280; font-size: 12px;">
              Je ontvangt deze email omdat er een nieuwe bestelling is geplaatst op getpawsy.pet
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[STRIPE-WEBHOOK] Failed to send admin notification:", errorText);
    } else {
      console.log("[STRIPE-WEBHOOK] Admin notification email sent successfully");
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error sending admin notification:", error);
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

// Helper function to track remarketing conversions
// deno-lint-ignore no-explicit-any
async function trackRemarketingConversion(
  supabaseAdmin: any,
  customerEmail: string,
  orderId: string
): Promise<void> {
  try {
    console.log("[STRIPE-WEBHOOK] Checking remarketing conversions for:", customerEmail);

    // Find any remarketing emails sent to this customer that were clicked but not yet converted
    // We attribute conversion to emails clicked within the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: remarketingEmails, error: fetchError } = await supabaseAdmin
      .from("remarketing_emails")
      .select("id, email_type, clicked_at, sent_at")
      .eq("customer_email", customerEmail)
      .is("converted_at", null)
      .gte("sent_at", thirtyDaysAgo.toISOString())
      .order("sent_at", { ascending: false });

    if (fetchError) {
      console.error("[STRIPE-WEBHOOK] Error fetching remarketing emails:", fetchError);
      return;
    }

    if (!remarketingEmails || remarketingEmails.length === 0) {
      console.log("[STRIPE-WEBHOOK] No unconverted remarketing emails found for:", customerEmail);
      return;
    }

    // Cast to proper type
    type RemarketingEmail = { id: string; email_type: string; clicked_at: string | null; sent_at: string };
    const emails = remarketingEmails as unknown as RemarketingEmail[];

    // Mark all relevant remarketing emails as converted
    // We attribute to the most recently clicked email, or the most recent email if none clicked
    const now = new Date().toISOString();
    
    // First priority: clicked emails (they interacted)
    const clickedEmails = emails.filter(e => e.clicked_at);
    
    if (clickedEmails.length > 0) {
      // Mark the most recent clicked email as the primary conversion
      const primaryConversion = clickedEmails[0];
      // deno-lint-ignore no-explicit-any
      const { error: updateError } = await (supabaseAdmin as any)
        .from("remarketing_emails")
        .update({ converted_at: now })
        .eq("id", primaryConversion.id);

      if (updateError) {
        console.error("[STRIPE-WEBHOOK] Error updating remarketing conversion:", updateError);
      } else {
        console.log(`[STRIPE-WEBHOOK] Remarketing conversion tracked! Email type: ${primaryConversion.email_type}, Customer: ${customerEmail}`);
      }
    } else {
      // No clicks, but they received emails - attribute to most recent opened or sent
      const mostRecentEmail = emails[0];
      // deno-lint-ignore no-explicit-any
      const { error: updateError } = await (supabaseAdmin as any)
        .from("remarketing_emails")
        .update({ converted_at: now })
        .eq("id", mostRecentEmail.id);

      if (updateError) {
        console.error("[STRIPE-WEBHOOK] Error updating remarketing conversion:", updateError);
      } else {
        console.log(`[STRIPE-WEBHOOK] Remarketing view-through conversion tracked! Email type: ${mostRecentEmail.email_type}, Customer: ${customerEmail}`);
      }
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error tracking remarketing conversion:", error);
  }
}

// Helper function to deduct packaging inventory
// deno-lint-ignore no-explicit-any
async function deductPackagingInventory(
  supabaseAdmin: any,
  orderId: string,
  orderItems: any[] = []
): Promise<void> {
  try {
    console.log("[STRIPE-WEBHOOK] Deducting packaging inventory for order:", orderId);

    // Determine poly mailer size based on product weight
    // Products over 500g use medium mailer, otherwise small
    const WEIGHT_THRESHOLD_GRAMS = 500;
    let usePolyMailer = false;
    let polyMailerType = "poly_mailer_small";
    
    if (orderItems && orderItems.length > 0) {
      // Check if any item has weight info suggesting it needs a poly mailer
      const maxWeight = Math.max(
        ...orderItems.map((item: any) => {
          // Weight could be in grams or kg, normalize to grams
          const weight = item.weight || 0;
          return weight > 100 ? weight : weight * 1000; // Assume kg if < 100
        })
      );
      
      if (maxWeight > 0) {
        usePolyMailer = true;
        polyMailerType = maxWeight > WEIGHT_THRESHOLD_GRAMS ? "poly_mailer_medium" : "poly_mailer_small";
        console.log(`[STRIPE-WEBHOOK] Max product weight: ${maxWeight}g, using ${polyMailerType}`);
      }
    }

    // Each order uses: 1 logo sticker + 1 thank you card + optionally 1 poly mailer
    const deductions: { itemType: string; amount: number }[] = [
      { itemType: "logo_sticker", amount: 1 },
      { itemType: "thank_you_card", amount: 1 },
    ];
    
    // Add poly mailer if products have weight data
    if (usePolyMailer) {
      deductions.push({ itemType: polyMailerType, amount: 1 });
    }

    for (const { itemType, amount } of deductions) {
      // Get current inventory
      const { data: item, error: fetchError } = await supabaseAdmin
        .from("packaging_inventory")
        .select("id, quantity, item_name, reorder_threshold")
        .eq("item_type", itemType)
        .single();

      if (fetchError || !item) {
        console.error(`[STRIPE-WEBHOOK] Could not find inventory for ${itemType}:`, fetchError);
        continue;
      }

      const newQuantity = Math.max(0, item.quantity - amount);

      // Update inventory
      const { error: updateError } = await supabaseAdmin
        .from("packaging_inventory")
        .update({ quantity: newQuantity })
        .eq("id", item.id);

      if (updateError) {
        console.error(`[STRIPE-WEBHOOK] Failed to update inventory for ${itemType}:`, updateError);
        continue;
      }

      // Log the deduction
      const { error: logError } = await supabaseAdmin
        .from("packaging_inventory_logs")
        .insert({
          inventory_id: item.id,
          item_type: itemType,
          change_amount: -amount,
          change_type: "order_deduction",
          order_id: orderId,
          notes: `Automatische aftrek voor bestelling`,
        });

      if (logError) {
        console.error(`[STRIPE-WEBHOOK] Failed to log inventory change for ${itemType}:`, logError);
      }

      console.log(`[STRIPE-WEBHOOK] Inventory deducted: ${itemType} ${item.quantity} -> ${newQuantity}`);

      // Check if below reorder threshold and log warning
      if (newQuantity <= item.reorder_threshold) {
        console.warn(`[STRIPE-WEBHOOK] ⚠️ Low stock alert: ${item.item_name} has ${newQuantity} units (threshold: ${item.reorder_threshold})`);
      }
    }
  } catch (error) {
    console.error("[STRIPE-WEBHOOK] Error deducting packaging inventory:", error);
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

        // ── Smoke test short-circuit ─────────────────────────────────────
        // For admin-initiated live smoke-test sessions we DO NOT create
        // orders, send emails, or fire marketing events. We only mark the
        // smoke_test_runs row + write a payment_success funnel event.
        if (session.metadata?.smoke_test === "true") {
          try {
            const piId = typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null;
            await supabaseAdmin.from("smoke_test_runs")
              .update({
                status: session.payment_status === "paid" ? "paid" : "pending",
                payment_intent_id: piId,
                webhook_received_at: new Date().toISOString(),
              })
              .eq("stripe_session_id", session.id);

            await supabaseAdmin.from("checkout_funnel_events").insert({
              session_id: session.metadata?.initiator ?? "smoke_test",
              stripe_session_id: session.id,
              step: "payment_success",
              value: (session.amount_total || 0) / 100,
              currency: session.currency ?? "usd",
              source: "stripe_webhook",
              source_component: "smoke_test",
              idempotency_key: `smoke_${session.id}_paid`,
              metadata: { smoke_test: true },
            });
            console.log("[STRIPE-WEBHOOK] Smoke test marked paid:", session.id.slice(0, 12));
          } catch (smokeErr) {
            console.error("[STRIPE-WEBHOOK] Smoke test handling failed:", smokeErr);
          }
          break;
        }

        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerName = session.customer_details?.name;
        const items = session.metadata?.items ? JSON.parse(session.metadata.items) : [];
        const totalValue = session.metadata?.total_value ? parseFloat(session.metadata.total_value) : (session.amount_total || 0) / 100;

        // ── Detect actual payment method used (Klarna / card / link / wallet …)
        // Stripe's Session does not include payment_method_details directly,
        // so we expand the underlying PaymentIntent's latest_charge.
        let paymentMethod: string | null = null;
        let isKlarna = false;
        try {
          if (session.payment_intent) {
            const pi = await stripe.paymentIntents.retrieve(
              session.payment_intent as string,
              { expand: ["latest_charge.payment_method_details"] },
            );
            const latestCharge = pi.latest_charge as Stripe.Charge | null;
            paymentMethod =
              latestCharge?.payment_method_details?.type ??
              (Array.isArray(pi.payment_method_types) ? pi.payment_method_types[0] : null) ??
              null;
            isKlarna = paymentMethod === "klarna";
            console.log("[STRIPE-WEBHOOK] Payment method detected:", paymentMethod, "klarna=", isKlarna);
          }
        } catch (pmErr) {
          console.error("[STRIPE-WEBHOOK] Failed to detect payment method:", pmErr);
        }

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
              payment_method: paymentMethod,
              is_klarna: isKlarna,
              payment_method_detected_at: paymentMethod ? new Date().toISOString() : null,
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
              currency: session.currency || "usd",
              customer_email: customerEmail,
              shipping_address: session.shipping_details,
              items: items,
              order_access_token: orderAccessToken,
              payment_method: paymentMethod,
              is_klarna: isKlarna,
              payment_method_detected_at: paymentMethod ? new Date().toISOString() : null,
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
            session.currency || "usd",
            session.shipping_details,
            customerName || undefined,
            orderAccessToken || undefined
          );
        } else {
          console.warn("[STRIPE-WEBHOOK] No customer email available for confirmation");
        }

        // Send admin notification email about new order
        await sendAdminOrderNotification(
          orderId,
          customerEmail || 'onbekend@email.com',
          customerName || undefined,
          items,
          totalValue,
          session.currency || "usd",
          session.shipping_details
        );

        // Create CJ Dropshipping order automatically after successful payment
        await createCJDropshippingOrder(orderId);

        // Deduct packaging inventory (1 sticker + 1 thank you card + poly mailer based on weight)
        await deductPackagingInventory(supabaseAdmin, orderId, items);

        // Track remarketing conversions
        if (customerEmail) {
          await trackRemarketingConversion(supabaseAdmin, customerEmail, orderId);
        }

        // ── Funnel + server-side TikTok events (best-effort, never fails the webhook)
        try {
          await supabaseAdmin.from("checkout_funnel_events").insert({
            stripe_session_id: session.id,
            step: "complete_payment",
            value: totalValue,
            currency: session.currency || "usd",
            payment_method: paymentMethod,
            is_klarna: isKlarna,
            source: "server",
            metadata: { order_id: orderId },
          });
          if (isKlarna) {
            await supabaseAdmin.from("checkout_funnel_events").insert({
              stripe_session_id: session.id,
              step: "klarna_purchase",
              value: totalValue,
              currency: session.currency || "usd",
              payment_method: paymentMethod,
              is_klarna: true,
              source: "server",
              metadata: { order_id: orderId },
            });
          }
        } catch (e) {
          console.error("[STRIPE-WEBHOOK] funnel insert failed:", e);
        }

        try {
          const contents = (items || []).map((it: any) => ({
            content_id: String(it.id),
            content_name: it.name,
            quantity: it.quantity ?? 1,
            price: it.price,
          }));
          await sendTikTokServerEvent({
            eventName: "CompletePayment",
            eventId: orderId,
            email: customerEmail || undefined,
            externalId: orderId,
            value: totalValue,
            currency: (session.currency || "usd").toUpperCase(),
            contents,
            description: orderId,
            properties: { payment_method: paymentMethod, is_klarna: isKlarna },
          });
          if (isKlarna) {
            await sendTikTokServerEvent({
              eventName: "KlarnaPurchase",
              eventId: `klarna_${orderId}`,
              email: customerEmail || undefined,
              externalId: orderId,
              value: totalValue,
              currency: (session.currency || "usd").toUpperCase(),
              contents,
              description: orderId,
              properties: { payment_method: "klarna" },
            });
          }
        } catch (e) {
          console.error("[STRIPE-WEBHOOK] tiktok server event failed:", e);
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
