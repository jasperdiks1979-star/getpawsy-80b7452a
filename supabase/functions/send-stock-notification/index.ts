import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  productId: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (expectedSecret) {
    const provided = req.headers.get("x-internal-secret") ?? "";
    if (provided !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { productId }: NotificationRequest = await req.json();

    // Get product details
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name, slug, image_url, price, stock")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      console.error("Product not found:", productError);
      return new Response(
        JSON.stringify({ error: "Product not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if product is actually back in stock
    if ((product.stock ?? 0) <= 0) {
      return new Response(
        JSON.stringify({ message: "Product still out of stock" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all pending notifications for this product
    const { data: notifications, error: notifError } = await supabase
      .from("stock_notifications")
      .select("id, email")
      .eq("product_id", productId)
      .is("notified_at", null);

    if (notifError) {
      console.error("Error fetching notifications:", notifError);
      throw notifError;
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending notifications" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const productUrl = `https://getpawsy.pet/product/${product.id}`;
    const productImage = product.image_url || "https://getpawsy.pet/og-image.png";

    let sentCount = 0;

    // Send emails to all subscribers
    for (const notification of notifications) {
      try {
        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
              <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header -->
                <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 32px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Back in Stock!</h1>
                </div>
                
                <!-- Content -->
                <div style="padding: 32px;">
                  <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">
                    Great news! The product you were waiting for is now available:
                  </p>
                  
                  <!-- Product Card -->
                  <div style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
                    <img src="${productImage}" alt="${product.name}" style="width: 100%; height: 200px; object-fit: cover;">
                    <div style="padding: 16px;">
                      <h2 style="margin: 0 0 8px; color: #111827; font-size: 18px;">${product.name}</h2>
                      <p style="margin: 0; color: #f97316; font-size: 24px; font-weight: 700;">$${product.price.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <!-- CTA Button -->
                  <a href="${productUrl}" style="display: block; background: linear-gradient(135deg, #f97316, #ea580c); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; text-align: center;">
                    View Product →
                  </a>
                  
                  <p style="color: #6b7280; font-size: 14px; margin: 24px 0 0; text-align: center;">
                    This item is back in stock and ready to ship.
                  </p>
                </div>
                
                <!-- Footer -->
                <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                    You received this email because you signed up for stock notifications at GetPawsy.
                  </p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "GetPawsy <noreply@getpawsy.pet>",
            to: [notification.email],
            subject: `🎉 ${product.name} is Back in Stock!`,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          // Mark notification as sent
          await supabase
            .from("stock_notifications")
            .update({ notified_at: new Date().toISOString() })
            .eq("id", notification.id);
          sentCount++;
        } else {
          const errorText = await emailResponse.text();
          console.error(`Failed to send email to ${notification.email}:`, errorText);
        }
      } catch (emailError) {
        console.error(`Error sending to ${notification.email}:`, emailError);
      }
    }

    console.log(`Sent ${sentCount} stock notifications for product ${product.name}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount,
        total: notifications.length 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-stock-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
