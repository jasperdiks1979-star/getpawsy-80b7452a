import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CampaignRequest {
  campaignId: string;
}

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== AUTHENTICATION CHECK ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Verify the user's JWT token
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== ADMIN ROLE CHECK ==========
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (roleError || !roleData) {
      console.error("Role check failed for user:", user.id);
      return new Response(
        JSON.stringify({ error: "Forbidden - Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== RATE LIMITING ==========
    const { data: rateLimitData } = await supabaseAdmin.rpc("check_rate_limit", {
      p_user_id: user.id,
      p_function_name: "send-email-campaign",
      p_max_requests: 10,
      p_window_minutes: 60,
    });

    if (rateLimitData && rateLimitData.length > 0 && !rateLimitData[0].allowed) {
      return new Response(
        JSON.stringify({ 
          error: "Rate limit exceeded. Please try again later.",
          reset_at: rateLimitData[0].reset_at 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== PROCESS CAMPAIGN ==========
    const { campaignId }: CampaignRequest = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Campaign ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the campaign
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("email_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error("Campaign fetch error:", campaignError);
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (campaign.status === "sent") {
      return new Response(
        JSON.stringify({ error: "Campaign has already been sent" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetPrefs = campaign.target_preferences as Preferences;

    // Fetch active subscribers
    const { data: subscribers, error: subError } = await supabaseAdmin
      .from("newsletter_subscribers")
      .select("email, preferences, preference_token")
      .eq("is_active", true);

    if (subError) {
      console.error("Subscribers fetch error:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscribers" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter subscribers based on target preferences
    const targetSubscribers = subscribers?.filter((sub) => {
      const prefs = sub.preferences as Preferences;
      // Check if subscriber has at least one matching preference
      return (
        (targetPrefs.product_updates && prefs.product_updates) ||
        (targetPrefs.pet_care_tips && prefs.pet_care_tips) ||
        (targetPrefs.promotions && prefs.promotions) ||
        (targetPrefs.new_arrivals && prefs.new_arrivals)
      );
    }) || [];

    if (targetSubscribers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscribers match the target preferences", sentCount: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let successCount = 0;
    const errors: string[] = [];

    // Audit log - record who sent this campaign
    console.log(`Campaign ${campaignId} triggered by admin user: ${user.id} (${user.email})`);

    // Send emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < targetSubscribers.length; i += batchSize) {
      const batch = targetSubscribers.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (subscriber) => {
          try {
            const encodedEmail = encodeURIComponent(subscriber.email);
            const unsubscribeUrl = `https://getpawsy.pet/unsubscribe?email=${encodedEmail}`;
            const preferencesUrl = `https://getpawsy.pet/newsletter-preferences?token=${subscriber.preference_token}`;
            
            // Tracking URLs
            const trackingPixelUrl = `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=open`;
            const trackClickUrl = (url: string) => 
              `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=click&url=${encodeURIComponent(url)}`;

            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${campaign.subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🐾 GetPawsy</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">${campaign.subject}</h2>
              <div style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                ${campaign.content.replace(/\n/g, '<br>')}
              </div>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 30px 40px 30px; text-align: center;">
              <a href="${trackClickUrl('https://getpawsy.pet')}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                Shop Nu bij GetPawsy
              </a>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f3f4f6; padding: 25px 30px; text-align: center;">
              <p style="color: #6b7280; font-size: 14px; margin: 0 0 15px 0;">
                Je ontvangt deze e-mail omdat je je hebt aangemeld voor onze nieuwsbrief.
              </p>
              <p style="margin: 0;">
                <a href="${trackClickUrl(preferencesUrl)}" style="color: #3b82f6; text-decoration: none; font-size: 13px;">Voorkeuren beheren</a>
                <span style="color: #d1d5db; margin: 0 10px;">|</span>
                <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: none; font-size: 13px;">Uitschrijven</a>
              </p>
              <p style="color: #9ca3af; font-size: 12px; margin: 15px 0 0 0;">
                © ${new Date().getFullYear()} GetPawsy. Alle rechten voorbehouden.
              </p>
            </td>
          </tr>
        </table>
        <!-- Tracking Pixel -->
        <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
      </td>
    </tr>
  </table>
</body>
</html>`;

            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "GetPawsy <noreply@getpawsy.pet>",
                to: [subscriber.email],
                subject: campaign.subject,
                html: emailHtml,
              }),
            });

            if (response.ok) {
              successCount++;
            } else {
              const errorData = await response.text();
              console.error(`Failed to send to ${subscriber.email}:`, errorData);
              errors.push(`${subscriber.email}: ${errorData}`);
            }
          } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`Error sending to ${subscriber.email}:`, err);
            errors.push(`${subscriber.email}: ${errorMessage}`);
          }
        })
      );

      // Small delay between batches to avoid rate limits
      if (i + batchSize < targetSubscribers.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Update campaign status
    const { error: updateError } = await supabaseAdmin
      .from("email_campaigns")
      .update({
        status: "sent",
        sent_count: successCount,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaignId);

    if (updateError) {
      console.error("Failed to update campaign status:", updateError);
    }

    console.log(`Campaign ${campaignId} sent by ${user.email}: ${successCount}/${targetSubscribers.length} emails`);

    return new Response(
      JSON.stringify({
        success: true,
        sentCount: successCount,
        totalTargeted: targetSubscribers.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in send-email-campaign:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
