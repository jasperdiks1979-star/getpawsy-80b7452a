import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PreferencesRequest {
  token: string;
  action: 'get' | 'update';
  preferences?: {
    product_updates: boolean;
    pet_care_tips: boolean;
    promotions: boolean;
    new_arrivals: boolean;
  };
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Newsletter preferences function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token, action, preferences }: PreferencesRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find subscriber by preference_token
    const { data: subscriber, error: fetchError } = await supabaseAdmin
      .from('newsletter_subscribers')
      .select('email, preferences, is_active')
      .eq('preference_token', token)
      .single();

    if (fetchError || !subscriber) {
      console.error("Subscriber not found:", fetchError);
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Handle GET action - return current preferences
    if (action === 'get') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          email: subscriber.email,
          preferences: subscriber.preferences,
          is_active: subscriber.is_active
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Handle UPDATE action
    if (action === 'update') {
      if (!preferences) {
        return new Response(
          JSON.stringify({ error: "Preferences are required for update" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('newsletter_subscribers')
        .update({ preferences })
        .eq('preference_token', token);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      console.log(`Preferences updated for: ${subscriber.email}`);

      // Send confirmation email
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const enabledPrefs = Object.entries(preferences)
          .filter(([_, enabled]) => enabled)
          .map(([key]) => {
            const labels: Record<string, string> = {
              product_updates: '📦 Product Updates',
              pet_care_tips: '🐾 Pet Care Tips',
              promotions: '🎁 Promotions & Deals',
              new_arrivals: '✨ New Arrivals'
            };
            return labels[key] || key;
          });

        const confirmationHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Preferences Updated</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 32px 40px; text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                          🐾 GetPawsy
                        </h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 24px; font-weight: 600; text-align: center;">
                          Preferences Updated ✓
                        </h2>
                        <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6; text-align: center;">
                          Your newsletter preferences have been saved successfully.
                        </p>
                        
                        ${enabledPrefs.length > 0 ? `
                        <div style="background-color: #f4f4f5; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                          <p style="margin: 0 0 12px 0; color: #52525b; font-size: 14px; font-weight: 600;">
                            You'll receive emails about:
                          </p>
                          ${enabledPrefs.map(pref => `<p style="margin: 0 0 8px 0; color: #71717a; font-size: 14px;">${pref}</p>`).join('')}
                        </div>
                        ` : `
                        <div style="background-color: #fef2f2; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
                          <p style="margin: 0; color: #dc2626; font-size: 14px;">
                            You've disabled all email categories. You won't receive any newsletters.
                          </p>
                        </div>
                        `}
                        
                        <!-- CTA Button -->
                        <div style="text-align: center;">
                          <a href="https://getpawsy.pet/newsletter-preferences?token=${token}" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                            Manage Preferences
                          </a>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f4f4f5; padding: 24px 40px; text-align: center;">
                        <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                          © ${new Date().getFullYear()} GetPawsy. All rights reserved.
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

        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: "GetPawsy <noreply@getpawsy.pet>",
              to: [subscriber.email],
              subject: "Your newsletter preferences have been updated",
              html: confirmationHtml,
            }),
          });
          console.log("Preferences confirmation email sent");
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Preferences updated successfully" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in newsletter-preferences function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
