import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UnsubscribeRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Unsubscribe newsletter function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: UnsubscribeRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Decode the token to get the email
    let email: string;
    try {
      email = atob(token);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email in token" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Processing unsubscribe request for: ${email}`);

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Update the subscriber to inactive
    const { data, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .update({ 
        is_active: false, 
        unsubscribed_at: new Date().toISOString() 
      })
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No matching record found - might already be unsubscribed
        return new Response(
          JSON.stringify({ success: true, message: "Already unsubscribed or not found" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      console.error("Database error:", error);
      throw error;
    }

    console.log(`Successfully unsubscribed: ${email}`);

    // Send confirmation email
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      const confirmationHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Unsubscribed from GetPawsy Newsletter</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #71717a 0%, #52525b 100%); padding: 32px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                        🐾 GetPawsy
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px; text-align: center;">
                      <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 24px; font-weight: 600;">
                        You've been unsubscribed
                      </h2>
                      <p style="margin: 0 0 24px 0; color: #52525b; font-size: 16px; line-height: 1.6;">
                        We're sad to see you go! You will no longer receive newsletter emails from GetPawsy.
                      </p>
                      <p style="margin: 0 0 32px 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                        Changed your mind? You can always subscribe again on our website.
                      </p>
                      
                      <!-- CTA Button -->
                      <a href="https://getpawsy.pet" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                        Visit GetPawsy
                      </a>
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
            to: [email],
            subject: "You've been unsubscribed from GetPawsy",
            html: confirmationHtml,
          }),
        });
        console.log("Unsubscribe confirmation email sent");
      } catch (emailError) {
        console.error("Failed to send unsubscribe confirmation:", emailError);
        // Don't fail the request if email fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Successfully unsubscribed" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in unsubscribe-newsletter function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
