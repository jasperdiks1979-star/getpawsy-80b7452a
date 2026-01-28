import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Appeal pages that should trigger email notifications
const APPEAL_PAGES = [
  '/google-review',
  '/technical-declaration',
  '/appeal-response',
];

// Googlebot and other Google crawler User-Agent patterns
const GOOGLE_BOT_PATTERNS = [
  /Googlebot/i,
  /Googlebot-Image/i,
  /Googlebot-News/i,
  /Googlebot-Video/i,
  /AdsBot-Google/i,
  /AdsBot-Google-Mobile/i,
  /Mediapartners-Google/i,
  /Google-InspectionTool/i,
  /GoogleOther/i,
  /Google-Extended/i,
  /Storebot-Google/i,
];

function detectBotType(userAgent: string): { isGooglebot: boolean; botType: string | null } {
  for (const pattern of GOOGLE_BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      const match = userAgent.match(pattern);
      return {
        isGooglebot: true,
        botType: match ? match[0] : 'Googlebot',
      };
    }
  }
  
  // Check for other common bots
  if (/bingbot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Bingbot' };
  }
  if (/Slurp/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Yahoo Slurp' };
  }
  if (/DuckDuckBot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'DuckDuckBot' };
  }
  if (/facebookexternalhit/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Facebook' };
  }
  if (/Twitterbot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'Twitter' };
  }
  if (/LinkedInBot/i.test(userAgent)) {
    return { isGooglebot: false, botType: 'LinkedIn' };
  }
  
  return { isGooglebot: false, botType: null };
}

function isAppealPage(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return APPEAL_PAGES.some(page => url.pathname === page || url.pathname.startsWith(page));
  } catch {
    // If not a valid URL, check if it matches as a path
    return APPEAL_PAGES.some(page => pageUrl === page || pageUrl.startsWith(page));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNotificationEmail(supabase: any): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'googlebot_notification_email')
      .single();

    if (error || !data) {
      console.log('Using default notification email');
      return 'support@getpawsy.pet';
    }
    return data.value || 'support@getpawsy.pet';
  } catch {
    return 'support@getpawsy.pet';
  }
}

async function sendGooglebotNotification(
  pageUrl: string, 
  botType: string, 
  ipAddress: string,
  notificationEmail: string
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log('RESEND_API_KEY not configured, skipping notification');
    return;
  }

  const timestamp = new Date().toLocaleString('nl-NL', { 
    timeZone: 'Europe/Amsterdam',
    dateStyle: 'full',
    timeStyle: 'long'
  });

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
          <h1 style="color: white; margin: 0; font-size: 24px;">Google heeft je pagina bekeken!</h1>
        </div>
        
        <!-- Content -->
        <div style="padding: 32px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; color: #166534; font-weight: 600;">
              ✅ Dit is een positief signaal voor je Google Ads appeal!
            </p>
          </div>
          
          <h2 style="color: #1f2937; font-size: 18px; margin-bottom: 16px;">Bezoek Details</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280; width: 120px;">Bot Type</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-weight: 600;">${botType}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Pagina</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937;">
                <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${pageUrl}</code>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Tijdstip</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${timestamp}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #6b7280;">IP Adres</td>
              <td style="padding: 12px 0; color: #1f2937;">${ipAddress}</td>
            </tr>
          </table>
          
          <div style="margin-top: 24px; padding: 16px; background: #eff6ff; border-radius: 8px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>💡 Tip:</strong> Dit bezoek is automatisch opgeslagen in je Crawler Analytics dashboard voor verdere analyse.
            </p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">
            Bekijk alle crawler bezoeken in je 
            <a href="https://getpawsy.pet/admin/crawler-analytics" style="color: #10b981; text-decoration: none;">Analytics Dashboard</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Alerts <alerts@getpawsy.pet>',
        to: [notificationEmail],
        subject: `🤖 ${botType} heeft je appeal pagina bezocht!`,
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resend API error:', response.status, errorText);
      return;
    }

    console.log(`Notification email sent for Googlebot visit to ${pageUrl}`);
  } catch (error) {
    console.error('Failed to send notification email:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pageUrl, userAgent, referrer } = await req.json();
    
    if (!pageUrl || !userAgent) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IP from headers (Cloudflare/proxy headers)
    const ipAddress = req.headers.get('cf-connecting-ip') || 
                      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                      req.headers.get('x-real-ip') ||
                      'unknown';

    const { isGooglebot, botType } = detectBotType(userAgent);

    // Initialize Supabase client with service role for insert
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log the visit
    const { error } = await supabase
      .from('crawler_visits')
      .insert({
        page_url: pageUrl,
        user_agent: userAgent,
        is_googlebot: isGooglebot,
        bot_type: botType,
        ip_address: ipAddress,
        referrer: referrer || null,
      });

    if (error) {
      console.error('Failed to log crawler visit:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to log visit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Logged visit: ${pageUrl} | Bot: ${botType || 'None'} | Googlebot: ${isGooglebot}`);

    // Send email notification if Googlebot visits an appeal page
    if (isGooglebot && isAppealPage(pageUrl)) {
      console.log(`Googlebot visited appeal page: ${pageUrl} - sending notification`);
      const notificationEmail = await getNotificationEmail(supabase);
      await sendGooglebotNotification(pageUrl, botType || 'Googlebot', ipAddress, notificationEmail);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        isGooglebot,
        botType,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-crawler-visit:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
