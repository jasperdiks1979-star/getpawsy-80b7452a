import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC signature generation for tracking URLs
async function generateHMAC(data: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const dataBuffer = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function generateTrackingSignature(
  campaignId: string,
  email: string,
  eventType: string,
  secretKey: string
): Promise<string> {
  const data = `${campaignId}:${email}:${eventType}`;
  return generateHMAC(data, secretKey);
}

interface CampaignRequest {
  campaignId: string;
  additionalEmails?: string[]; // Optional manually added emails
}

interface Preferences {
  product_updates: boolean;
  pet_care_tips: boolean;
  promotions: boolean;
  new_arrivals: boolean;
}

// Plain-text version builder for better deliverability
const buildPlainTextEmail = (params: {
  subject: string;
  content: string;
  subscriberEmail: string;
  preferenceToken: string;
}) => {
  const { subject, content, subscriberEmail, preferenceToken } = params;
  
  const unsubscribeUrl = preferenceToken 
    ? `https://getpawsy.pet/unsubscribe?token=${preferenceToken}`
    : `https://getpawsy.pet/newsletter-preferences`;
  const preferencesUrl = `https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}`;
  const shopUrl = 'https://getpawsy.pet/products';
  
  // Strip any HTML tags that might be in content
  const cleanContent = content.replace(/<[^>]*>/g, '');
  
  return `${subject}

${cleanContent}

---

🛒 Shop Now: ${shopUrl}

Featured This Week:
• Premium Food: https://getpawsy.pet/products?category=dog-food-treats
• Fun Toys: https://getpawsy.pet/products?category=dog-toys
• Cozy Beds: https://getpawsy.pet/products?category=dog-beds

---

GetPawsy - Premium Pet Products & Care
Making pets happy, one product at a time

Shop: https://getpawsy.pet/products
Blog: https://getpawsy.pet/blog
About: https://getpawsy.pet/about
Contact: https://getpawsy.pet/contact

---

You're receiving this email because you subscribed to our newsletter at getpawsy.pet

Manage Preferences: ${preferencesUrl}
Unsubscribe: ${unsubscribeUrl}

© ${new Date().getFullYear()} GetPawsy. All rights reserved.
The Netherlands 🇳🇱 | support@getpawsy.pet
`;
};

// Professional email template builder for better deliverability
const buildEmailTemplate = (params: {
  subject: string;
  content: string;
  campaignId: string;
  subscriberEmail: string;
  preferenceToken: string;
  trackClickUrl: (url: string) => string;
  trackingPixelUrl: string;
}) => {
  const { subject, content, campaignId, subscriberEmail, preferenceToken, trackClickUrl, trackingPixelUrl } = params;
  
  // Use secure preference_token for unsubscribe, not email in URL
  const unsubscribeUrl = preferenceToken 
    ? `https://getpawsy.pet/unsubscribe?token=${preferenceToken}`
    : `https://getpawsy.pet/newsletter-preferences`;
  const preferencesUrl = `https://getpawsy.pet/newsletter-preferences?token=${preferenceToken}`;
  const shopUrl = trackClickUrl('https://getpawsy.pet/products');
  const logoUrl = 'https://getpawsy.pet/favicon.png';
  
  // Format content with proper HTML - replace newlines and add styling
  const formattedContent = content
    .split('\n\n')
    .map(paragraph => `<p style="margin: 0 0 16px 0; color: #374151; font-size: 16px; line-height: 1.7;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: #f97316; text-decoration: none; }
    a:hover { color: #ea580c; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 10px !important; }
      .content-padding { padding: 24px 20px !important; }
      .hero-title { font-size: 22px !important; }
      .cta-button { padding: 14px 28px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #faf5f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  
  <!-- Preheader text (hidden but shown in email preview) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Discover amazing pet products and tips from GetPawsy! 🐾 Quality items for your furry friends.
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #faf5f0;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        
        <!-- Email Container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(139, 69, 19, 0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #c2410c 100%); padding: 32px 30px; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <img src="${logoUrl}" alt="GetPawsy" width="48" height="48" style="display: block; border-radius: 12px; margin-bottom: 12px;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                      GetPawsy
                    </h1>
                    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px; font-weight: 500;">
                      Premium Pet Products & Care
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Hero Banner Image -->
          <tr>
            <td style="padding: 0;">
              <a href="${shopUrl}" style="display: block;">
                <img src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&h=200&fit=crop&crop=faces" 
                     alt="Happy pets deserve the best" 
                     width="600" 
                     height="200" 
                     style="display: block; width: 100%; height: auto; object-fit: cover;">
              </a>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td class="content-padding" style="padding: 40px 36px;">
              
              <!-- Subject as Title -->
              <h2 class="hero-title" style="color: #1c1917; margin: 0 0 24px 0; font-size: 26px; font-weight: 700; line-height: 1.3; letter-spacing: -0.3px;">
                ${subject}
              </h2>
              
              <!-- Email Content -->
              <div style="margin-bottom: 32px;">
                ${formattedContent}
              </div>
              
              <!-- Featured Products Section -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px; background-color: #fffbeb; border-radius: 12px; overflow: hidden;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="color: #92400e; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
                      🌟 Featured This Week
                    </h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="33%" align="center" style="padding: 8px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/products?category=dog-food-treats')}" style="display: block;">
                            <img src="https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=150&h=150&fit=crop" alt="Premium Food" width="100" height="100" style="border-radius: 12px; display: block; margin: 0 auto 8px auto;">
                            <span style="color: #78350f; font-size: 13px; font-weight: 500;">Premium Food</span>
                          </a>
                        </td>
                        <td width="33%" align="center" style="padding: 8px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/products?category=dog-toys')}" style="display: block;">
                            <img src="https://images.unsplash.com/photo-1535008652995-e95986556e32?w=150&h=150&fit=crop" alt="Fun Toys" width="100" height="100" style="border-radius: 12px; display: block; margin: 0 auto 8px auto;">
                            <span style="color: #78350f; font-size: 13px; font-weight: 500;">Fun Toys</span>
                          </a>
                        </td>
                        <td width="33%" align="center" style="padding: 8px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/products?category=dog-beds')}" style="display: block;">
                            <img src="https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=150&h=150&fit=crop" alt="Cozy Beds" width="100" height="100" style="border-radius: 12px; display: block; margin: 0 auto 8px auto;">
                            <span style="color: #78350f; font-size: 13px; font-weight: 500;">Cozy Beds</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${shopUrl}" class="cta-button" style="display: inline-block; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4); transition: all 0.2s;">
                      🛒 Shop Now at GetPawsy
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Trust Badges -->
          <tr>
            <td style="padding: 0 36px 32px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f4; border-radius: 12px;">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                      <tr>
                        <td style="padding: 0 16px; text-align: center;">
                          <span style="font-size: 24px;">🚚</span>
                          <p style="margin: 4px 0 0 0; color: #57534e; font-size: 12px; font-weight: 500;">Free Shipping</p>
                        </td>
                        <td style="padding: 0 16px; text-align: center;">
                          <span style="font-size: 24px;">⭐</span>
                          <p style="margin: 4px 0 0 0; color: #57534e; font-size: 12px; font-weight: 500;">5-Star Reviews</p>
                        </td>
                        <td style="padding: 0 16px; text-align: center;">
                          <span style="font-size: 24px;">🔒</span>
                          <p style="margin: 4px 0 0 0; color: #57534e; font-size: 12px; font-weight: 500;">Secure Payment</p>
                        </td>
                        <td style="padding: 0 16px; text-align: center;">
                          <span style="font-size: 24px;">💝</span>
                          <p style="margin: 4px 0 0 0; color: #57534e; font-size: 12px; font-weight: 500;">Pet Happiness</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #292524; padding: 32px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <h3 style="color: #ffffff; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">🐾 GetPawsy</h3>
                    <p style="color: #a8a29e; margin: 0; font-size: 14px;">Making pets happy, one product at a time</p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom: 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 0 12px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/products')}" style="color: #f97316; font-size: 14px; font-weight: 500;">Shop</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/blog')}" style="color: #f97316; font-size: 14px; font-weight: 500;">Blog</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/about')}" style="color: #f97316; font-size: 14px; font-weight: 500;">About</a>
                        </td>
                        <td style="padding: 0 12px;">
                          <a href="${trackClickUrl('https://getpawsy.pet/contact')}" style="color: #f97316; font-size: 14px; font-weight: 500;">Contact</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="border-top: 1px solid #44403c; padding-top: 20px;">
                    <p style="color: #78716c; font-size: 13px; margin: 0 0 12px 0;">
                      You're receiving this email because you subscribed to our newsletter at getpawsy.pet
                    </p>
                    <p style="margin: 0;">
                      <a href="${trackClickUrl(preferencesUrl)}" style="color: #a8a29e; font-size: 12px; text-decoration: underline;">Manage Preferences</a>
                      <span style="color: #57534e; margin: 0 8px;">•</span>
                      <a href="${unsubscribeUrl}" style="color: #a8a29e; font-size: 12px; text-decoration: underline;">Unsubscribe</a>
                    </p>
                    <p style="color: #57534e; font-size: 11px; margin: 16px 0 0 0;">
                      © ${new Date().getFullYear()} GetPawsy. All rights reserved.<br>
                      The Netherlands 🇳🇱 | support@getpawsy.pet
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
        
        <!-- Tracking Pixel (invisible) -->
        <img src="${trackingPixelUrl}" width="1" height="1" alt="" style="display: none; width: 1px; height: 1px; border: 0;">
        
      </td>
    </tr>
  </table>
  
</body>
</html>`;
};

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
    const { campaignId, additionalEmails }: CampaignRequest = await req.json();

    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "Campaign ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate additional emails if provided
    const validAdditionalEmails: string[] = [];
    if (additionalEmails && Array.isArray(additionalEmails)) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      for (const email of additionalEmails) {
        if (typeof email === 'string' && emailRegex.test(email.trim())) {
          validAdditionalEmails.push(email.trim().toLowerCase());
        }
      }
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

    // Combine with additional manual emails (avoiding duplicates)
    const existingEmails = new Set(targetSubscribers.map(s => s.email.toLowerCase()));
    const additionalRecipients = validAdditionalEmails
      .filter(email => !existingEmails.has(email))
      .map(email => ({ email, preferences: null, preference_token: null }));

    const allRecipients = [...targetSubscribers, ...additionalRecipients];

    if (allRecipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No recipients found (no subscribers match preferences and no additional emails)", sentCount: 0 }),
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
    for (let i = 0; i < allRecipients.length; i += batchSize) {
      const batch = allRecipients.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (subscriber) => {
          try {
            const encodedEmail = encodeURIComponent(subscriber.email);
            const trackingSecret = Deno.env.get("TRACKING_HMAC_SECRET");
            
            // Generate HMAC signatures for tracking URLs if secret is configured
            let openSignature = '';
            let clickSignature = '';
            if (trackingSecret) {
              openSignature = await generateTrackingSignature(campaignId, subscriber.email, 'open', trackingSecret);
              clickSignature = await generateTrackingSignature(campaignId, subscriber.email, 'click', trackingSecret);
            }
            
            // Tracking URLs with HMAC signatures
            const trackingPixelUrl = trackingSecret
              ? `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=open&s=${openSignature}`
              : `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=open`;
            const trackClickUrl = (url: string) => trackingSecret
              ? `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=click&s=${clickSignature}&url=${encodeURIComponent(url)}`
              : `https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/track-email-event?c=${campaignId}&e=${encodedEmail}&t=click&url=${encodeURIComponent(url)}`;

            const emailHtml = buildEmailTemplate({
              subject: campaign.subject,
              content: campaign.content,
              campaignId,
              subscriberEmail: subscriber.email,
              preferenceToken: subscriber.preference_token || '',
              trackClickUrl,
              trackingPixelUrl,
            });

            // Build plain-text version for better deliverability
            const emailText = buildPlainTextEmail({
              subject: campaign.subject,
              content: campaign.content,
              subscriberEmail: subscriber.email,
              preferenceToken: subscriber.preference_token || '',
            });

            // Use secure preference_token for List-Unsubscribe header
            const unsubscribeUrl = subscriber.preference_token
              ? `https://getpawsy.pet/unsubscribe?token=${subscriber.preference_token}`
              : `https://getpawsy.pet/newsletter-preferences`;

            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${RESEND_API_KEY}`,
              },
              body: JSON.stringify({
                from: "GetPawsy <newsletter@getpawsy.pet>",
                reply_to: "support@getpawsy.pet",
                to: [subscriber.email],
                subject: campaign.subject,
                html: emailHtml,
                text: emailText, // Plain-text alternative for spam score improvement
                headers: {
                  "List-Unsubscribe": `<${unsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
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
      if (i + batchSize < allRecipients.length) {
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

    const additionalCount = additionalRecipients.length;
    console.log(`Campaign ${campaignId} sent by ${user.email}: ${successCount}/${allRecipients.length} emails (${targetSubscribers.length} subscribers + ${additionalCount} manual)`);

    return new Response(
      JSON.stringify({
        success: true,
        sentCount: successCount,
        totalTargeted: allRecipients.length,
        subscriberCount: targetSubscribers.length,
        additionalEmailCount: additionalCount,
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
