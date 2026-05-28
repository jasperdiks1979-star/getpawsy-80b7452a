// Geo classification edge function — additive, read-only, non-blocking.
// Returns the visitor's country (from edge headers) plus two labels:
//   - `geo_tier`     : us_premium | tier_1 | tier_2 | international | unknown
//   - `geo_quality`  : verified | probable | unknown | bot_like
//
// `geo_quality` is the CI-1 trust signal used by the admin funnel + traffic
// classifier. It cross-references the edge country header, the IP forwarding
// chain length, and the user-agent (crawlers/headless => bot_like).
// Never touches checkout, Stripe, or auth. Anonymous, JWT not required.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TIER_1 = new Set(['US', 'CA', 'GB', 'AU', 'NZ', 'IE']);
const TIER_2 = new Set([
  'DE', 'FR', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI',
  'CH', 'AT', 'IT', 'ES', 'PT', 'LU', 'JP', 'SG',
]);

const BOT_UA = /(bot|crawler|spider|scrapy|headless|phantom|puppeteer|playwright|selenium|lighthouse|curl|wget|python-requests|go-http-client)/i;

function tier(country: string | null): string {
  if (!country) return 'unknown';
  const c = country.toUpperCase();
  if (c === 'US') return 'us_premium';
  if (TIER_1.has(c)) return 'tier_1';
  if (TIER_2.has(c)) return 'tier_2';
  return 'international';
}

/**
 * Build a trust label independent of the commercial tier.
 * - bot_like  : UA is clearly automated
 * - verified  : country present AND IP chain is single-hop (no obvious proxy)
 * - probable  : country present but IP chain has >1 forwarded hop
 * - unknown   : no country header
 */
function quality(country: string | null, xff: string | null, ua: string | null): string {
  if (ua && BOT_UA.test(ua)) return 'bot_like';
  if (!country) return 'unknown';
  const hops = xff ? xff.split(',').filter(Boolean).length : 1;
  return hops > 2 ? 'probable' : 'verified';
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const h = req.headers;
    const country =
      h.get('cf-ipcountry') ||
      h.get('x-vercel-ip-country') ||
      h.get('x-country-code') ||
      null;
    const region =
      h.get('cf-region') ||
      h.get('x-vercel-ip-country-region') ||
      null;
    const city =
      h.get('cf-ipcity') ||
      h.get('x-vercel-ip-city') ||
      null;

    const xff = h.get('x-forwarded-for');
    const ua = h.get('user-agent');
    const body = {
      country,
      region,
      city,
      geo_tier: tier(country),
      geo_quality: quality(country, xff, ua),
      ts: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ country: null, geo_tier: 'unknown', geo_quality: 'unknown', error: String(e) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});