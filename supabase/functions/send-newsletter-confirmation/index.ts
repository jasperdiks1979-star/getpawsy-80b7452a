import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NewsletterConfirmationRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Send newsletter confirmation function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: NewsletterConfirmationRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Sending newsletter confirmation to: ${email}`);

    // Get the preference_token for this subscriber
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: subscriber } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('preference_token')
      .eq('email', email.toLowerCase())
      .single();

    // Only send the confirmation to addresses that actually subscribed.
    // Prevents abuse of this endpoint to spam arbitrary recipients.
    if (!subscriber) {
      console.warn(`[send-newsletter-confirmation] No subscriber row for ${email}; refusing to send.`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const preferenceToken = subscriber?.preference_token || '';

    console.log(`Sending newsletter confirmation to: ${email}`);

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeEmail = escapeHtml(email);

    const confirmationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to GetPawsy Newsletter!</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 40px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">
                      🐾 Welcome to the Pack!
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 24px; font-weight: 600; text-align: center;">
                      You're officially subscribed! 🎉
                    </h2>
                    <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6; text-align: center;">
                      Thanks for joining the GetPawsy newsletter! Get ready for:
                    </p>
                    
                    <!-- Benefits List -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                      <tr>
                        <td style="padding: 12px 0;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">🛍️</span>
                              </td>
                              <td>
                                <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 500;">Exclusive Deals & Discounts</p>
                                <p style="margin: 4px 0 0 0; color: #71717a; font-size: 14px;">Be the first to know about sales and special offers</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">📦</span>
                              </td>
                              <td>
                                <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 500;">New Product Alerts</p>
                                <p style="margin: 4px 0 0 0; color: #71717a; font-size: 14px;">Early access to our latest pet products</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <table cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="width: 40px; vertical-align: top;">
                                <span style="font-size: 20px;">💡</span>
                              </td>
                              <td>
                                <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 500;">Pet Care Tips</p>
                                <p style="margin: 4px 0 0 0; color: #71717a; font-size: 14px;">Expert advice to keep your furry friends happy</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="https://getpawsy.pet/products" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                            Start Shopping 🐕
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Social Links -->
                <tr>
                  <td style="padding: 0 40px 32px 40px; text-align: center;">
                    <p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;">Follow us for more pet content!</p>
                    <table cellpadding="0" cellspacing="0" align="center">
                      <tr>
                        <td style="padding: 0 8px;">
                          <a href="https://instagram.com" style="color: #f97316; text-decoration: none; font-size: 14px;">Instagram</a>
                        </td>
                        <td style="padding: 0 8px; color: #d4d4d8;">|</td>
                        <td style="padding: 0 8px;">
                          <a href="https://facebook.com" style="color: #f97316; text-decoration: none; font-size: 14px;">Facebook</a>
                        </td>
                        <td style="padding: 0 8px; color: #d4d4d8;">|</td>
                        <td style="padding: 0 8px;">
                          <a href="https://twitter.com" style="color: #f97316; text-decoration: none; font-size: 14px;">Twitter</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">
                      You're receiving this because you subscribed at getpawsy.pet
                    </p>
                    <p style="margin: 0 0 12px 0; color: #a1a1aa; font-size: 12px;">
                      © ${new Date().getFullYear()} GetPawsy. All rights reserved.<br>
                      <a href="https://getpawsy.pet/privacy" style="color: #a1a1aa; text-decoration: underline;">Privacy Policy</a>
                    </p>
                    <p style="margin: 0; color: #a1a1aa; font-size: 11px;">
                      ${preferenceToken ? `<a href="https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}" style="color: #a1a1aa; text-decoration: underline;">Manage Preferences</a> | ` : ''}
                      <a href="https://getpawsy.pet/unsubscribe?token=${preferenceToken || ''}" style="color: #a1a1aa; text-decoration: underline;">Unsubscribe</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "GetPawsy <noreply@getpawsy.pet>",
        to: [email],
        subject: "Welcome to the GetPawsy Pack! 🐾",
        html: confirmationHtml,
        reply_to: "support@getpawsy.pet",
      }),
    });

    const responseText = await emailResponse.text();
    
    if (!emailResponse.ok) {
      console.error("Resend API error:", responseText);
      throw new Error(`Failed to send email: ${responseText}`);
    }

    console.log("Newsletter confirmation email sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-newsletter-confirmation function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
