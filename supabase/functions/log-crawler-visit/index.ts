import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
