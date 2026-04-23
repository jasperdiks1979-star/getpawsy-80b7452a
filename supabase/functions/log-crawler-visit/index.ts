import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Robots-Tag': 'all',
  'X-Content-Served-Identically': 'true',
};

// Appeal pages that should trigger email notifications
const APPEAL_PAGES = [
  '/google-review',
  '/technical-declaration',
  '/appeal-response',
];

// -----------------------------------------------------------------------------
// Verified-Googlebot IP allowlist
// -----------------------------------------------------------------------------
// Google publishes the canonical IP ranges for its crawlers as JSON files.
// We fetch + cache them per cold start (and refresh every 24h) so we can mark
// requests as `verified: true` only when the source IP matches one of the
// official ranges. Spoofed UAs from random IPs will be downgraded to
// `is_googlebot=false` and won't trigger notifications.
//
// Docs: https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
// -----------------------------------------------------------------------------
const GOOGLE_IP_RANGE_URLS = [
  'https://developers.google.com/static/search/apis/ipranges/googlebot.json',
  'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json',
  'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json',
  // Includes Search Console rendering / Inspection Tool fetchers run from GCP.
  'https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers-google.json',
];

// Optional override: comma-separated CIDRs treated as additional trusted
// rendering services (e.g. internal QA proxies). Set GOOGLEBOT_EXTRA_CIDRS.
const EXTRA_CIDRS = (Deno.env.get('GOOGLEBOT_EXTRA_CIDRS') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type ParsedRange = {
  version: 4 | 6;
  // For v4: 32-bit base & mask. For v6: bigint base & prefix length.
  base: number | bigint;
  mask: number | bigint;
  prefix: number;
};

let cachedRanges: ParsedRange[] | null = null;
let cachedAt = 0;
const RANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

function expandIpv6(ip: string): string | null {
  // Strip zone id if present (e.g. fe80::1%eth0)
  const clean = ip.split('%')[0];
  // Handle "::" expansion
  if (clean.indexOf(':::') !== -1) return null;
  const hasDoubleColon = clean.indexOf('::') !== -1;
  let parts: string[];
  if (hasDoubleColon) {
    const [head, tail] = clean.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) return null;
    parts = [...headParts, ...Array(missing).fill('0'), ...tailParts];
  } else {
    parts = clean.split(':');
  }
  if (parts.length !== 8) return null;
  return parts.map((p) => (p === '' ? '0' : p).padStart(4, '0')).join('');
}

function ipv6ToBigInt(ip: string): bigint | null {
  const expanded = expandIpv6(ip);
  if (!expanded) return null;
  try {
    return BigInt('0x' + expanded);
  } catch {
    return null;
  }
}

function parseCidr(cidr: string): ParsedRange | null {
  const [addr, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix)) return null;

  if (addr.includes(':')) {
    if (prefix < 0 || prefix > 128) return null;
    const base = ipv6ToBigInt(addr);
    if (base === null) return null;
    const maskBits = prefix === 0 ? 0n : ((1n << 128n) - (1n << BigInt(128 - prefix)));
    return { version: 6, base: base & maskBits, mask: maskBits, prefix };
  }

  if (prefix < 0 || prefix > 32) return null;
  const base = ipv4ToInt(addr);
  if (base === null) return null;
  const maskBits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { version: 4, base: (base & maskBits) >>> 0, mask: maskBits, prefix };
}

function ipMatchesRange(ip: string, range: ParsedRange): boolean {
  if (range.version === 4) {
    if (ip.includes(':')) return false;
    const n = ipv4ToInt(ip);
    if (n === null) return false;
    return ((n & (range.mask as number)) >>> 0) === (range.base as number);
  }
  // v6
  if (!ip.includes(':')) return false;
  const n = ipv6ToBigInt(ip);
  if (n === null) return false;
  return (n & (range.mask as bigint)) === (range.base as bigint);
}

async function loadGoogleRanges(): Promise<ParsedRange[]> {
  const now = Date.now();
  if (cachedRanges && now - cachedAt < RANGE_TTL_MS) return cachedRanges;

  const ranges: ParsedRange[] = [];
  for (const url of GOOGLE_IP_RANGE_URLS) {
    try {
      const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
      if (!res.ok) {
        console.warn(`[crawler-allowlist] Failed to fetch ${url}: HTTP ${res.status}`);
        continue;
      }
      const json = await res.json() as { prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }> };
      for (const p of json.prefixes || []) {
        const cidr = p.ipv4Prefix || p.ipv6Prefix;
        if (!cidr) continue;
        const parsed = parseCidr(cidr);
        if (parsed) ranges.push(parsed);
      }
    } catch (err) {
      console.warn(`[crawler-allowlist] Error fetching ${url}:`, err);
    }
  }

  for (const cidr of EXTRA_CIDRS) {
    const parsed = parseCidr(cidr);
    if (parsed) ranges.push(parsed);
    else console.warn(`[crawler-allowlist] Ignoring invalid GOOGLEBOT_EXTRA_CIDRS entry: ${cidr}`);
  }

  // If the fetch totally failed (e.g. cold start with network blip) keep the
  // previous cache to avoid flapping; otherwise replace it.
  if (ranges.length === 0 && cachedRanges) {
    console.warn('[crawler-allowlist] Range fetch returned 0 entries; keeping stale cache');
    return cachedRanges;
  }

  cachedRanges = ranges;
  cachedAt = now;
  console.log(`[crawler-allowlist] Loaded ${ranges.length} Google IP ranges`);
  return ranges;
}

async function isVerifiedGoogleIp(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  // Strip IPv6 brackets / port suffix if any
  const cleaned = ip.replace(/^\[/, '').replace(/\].*$/, '').split(' ')[0];
  try {
    const ranges = await loadGoogleRanges();
    if (ranges.length === 0) return false;
    for (const r of ranges) {
      if (ipMatchesRange(cleaned, r)) return true;
    }
    return false;
  } catch (err) {
    console.warn('[crawler-allowlist] Verification error:', err);
    return false;
  }
}

// Googlebot and other Google crawler User-Agent patterns
// Reference: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
const GOOGLE_BOT_PATTERNS = [
  // Main Googlebot (Search, Discover, Images, Video, News)
  /Googlebot\/\d/i,
  /Googlebot-Image/i,
  /Googlebot-Video/i,
  /Googlebot-News/i,
  // Google Ads bots
  /AdsBot-Google/i,
  /AdsBot-Google-Mobile/i,
  /Mediapartners-Google/i,
  // Google Shopping (Storebot)
  /Storebot-Google/i,
  // Search Console & Testing tools
  /Google-InspectionTool/i,
  // Generic crawlers (R&D, internal)
  /GoogleOther-Image/i,
  /GoogleOther-Video/i,
  /GoogleOther/i,
  // Vertex AI & Extended
  /Google-CloudVertexBot/i,
  /Google-Extended/i,
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

    const { isGooglebot: uaIsGooglebot, botType } = detectBotType(userAgent);

    // Verify against Google's official published IP ranges.
    // - If UA claims Googlebot AND the IP matches → fully trusted.
    // - If UA claims Googlebot but IP does NOT match → spoofed; downgrade
    //   `is_googlebot` to false so dashboards don't get polluted.
    // - Other bots / humans pass through unchanged.
    let verifiedGoogleIp = false;
    if (uaIsGooglebot) {
      verifiedGoogleIp = await isVerifiedGoogleIp(ipAddress);
    }
    const isGooglebot = uaIsGooglebot && verifiedGoogleIp;
    const spoofedGooglebot = uaIsGooglebot && !verifiedGoogleIp;

    if (spoofedGooglebot) {
      console.warn(
        `[crawler-allowlist] Spoofed Googlebot UA from non-Google IP ${ipAddress} → ${pageUrl}`,
      );
    }

    // Initialize Supabase client with service role for insert
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log the visit. We tag spoofed UAs in the `bot_type` column so they're
    // still searchable but won't be treated as real Googlebot traffic.
    const loggedBotType = spoofedGooglebot
      ? `${botType ?? 'Googlebot'} (spoofed-ua)`
      : botType;
    const { error } = await supabase
      .from('crawler_visits')
      .insert({
        page_url: pageUrl,
        user_agent: userAgent,
        is_googlebot: isGooglebot,
        bot_type: loggedBotType,
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

    console.log(
      `Logged visit: ${pageUrl} | Bot: ${loggedBotType || 'None'} | VerifiedGooglebot: ${isGooglebot}`,
    );

    // Send email notification only for verified Googlebot visits to appeal pages.
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
        verified: verifiedGoogleIp,
        spoofed: spoofedGooglebot,
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
