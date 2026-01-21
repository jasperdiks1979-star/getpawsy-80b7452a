import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

interface AbandonedCart {
  id: string;
  session_id: string;
  customer_email: string;
  cart_items: CartItem[];
  cart_total: number;
  reminder_count: number;
  created_at: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find abandoned carts older than 1 hour with email, not yet recovered, with less than 2 reminders
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: abandonedCarts, error: fetchError } = await supabase
      .from("abandoned_carts")
      .select("*")
      .not("customer_email", "is", null)
      .is("recovered_at", null)
      .lt("reminder_count", 2)
      .lt("updated_at", oneHourAgo)
      .gt("created_at", oneDayAgo)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${oneDayAgo}`);

    if (fetchError) {
      console.error("Error fetching abandoned carts:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${abandonedCarts?.length || 0} abandoned carts to process`);

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const cart of (abandonedCarts as AbandonedCart[]) || []) {
      try {
        const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
        
        if (items.length === 0) {
          console.log(`Skipping cart ${cart.id} - no items`);
          continue;
        }

        // Build email HTML
        const itemsHtml = items.map((item: CartItem) => `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee;">
              <strong>${item.name}</strong><br>
              <span style="color: #666;">Aantal: ${item.quantity}</span>
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
              €${(item.price * item.quantity).toFixed(2)}
            </td>
          </tr>
        `).join("");

        const isFirstReminder = cart.reminder_count === 0;
        const subject = isFirstReminder 
          ? "Je hebt nog items in je winkelwagen! 🛒" 
          : "We missen je! Kom je bestelling afronden? 💕";

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #FF6B9D 0%, #C44569 100%); padding: 30px; text-align: center; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">GetPawsy</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Premium huisdierproducten</p>
              </div>
              
              <div style="background: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h2 style="color: #333; margin: 0 0 20px 0;">
                  ${isFirstReminder ? "Hé, je bent iets vergeten! 🐾" : "We missen je! 💕"}
                </h2>
                
                <p style="color: #666; line-height: 1.6;">
                  ${isFirstReminder 
                    ? "Je hebt nog een paar geweldige producten in je winkelwagen achtergelaten. Maak je bestelling af voordat ze uitverkocht zijn!"
                    : "Je winkelwagen wacht nog steeds op je! Deze producten zijn nog beschikbaar, maar misschien niet lang meer."}
                </p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="2" style="padding: 16px 12px; font-weight: bold; font-size: 18px;">Totaal:</td>
                      <td style="padding: 16px 12px; text-align: right; font-weight: bold; font-size: 18px; color: #C44569;">
                        €${cart.cart_total.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://getpawsy.lovable.app/cart" 
                     style="display: inline-block; background: linear-gradient(135deg, #FF6B9D 0%, #C44569 100%); color: white; text-decoration: none; padding: 16px 40px; border-radius: 30px; font-weight: bold; font-size: 16px;">
                    Bestelling Afronden →
                  </a>
                </div>
                
                <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
                  Heb je vragen? Neem contact met ons op via info@getpawsy.pet
                </p>
              </div>
              
              <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
                Je ontvangt deze email omdat je items hebt toegevoegd aan je winkelwagen op GetPawsy.
              </p>
            </div>
          </body>
          </html>
        `;

        // Send email via Resend API
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "GetPawsy <noreply@getpawsy.pet>",
            to: [cart.customer_email],
            subject: subject,
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          throw new Error(`Resend API error: ${errorText}`);
        }

        // Update the cart with reminder sent
        await supabase
          .from("abandoned_carts")
          .update({
            reminder_sent_at: new Date().toISOString(),
            reminder_count: cart.reminder_count + 1,
          })
          .eq("id", cart.id);

        results.push({ email: cart.customer_email, success: true });
        console.log(`Sent abandoned cart email to ${cart.customer_email}`);

      } catch (emailError: any) {
        console.error(`Failed to send email for cart ${cart.id}:`, emailError);
        results.push({ 
          email: cart.customer_email, 
          success: false, 
          error: emailError.message 
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        processed: results.length,
        results 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in send-abandoned-cart-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
