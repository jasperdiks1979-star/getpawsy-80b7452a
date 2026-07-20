// Geo classification edge function — additive, read-only, non-blocking.
// Returns the visitor's country (from edge headers) plus two labels:
//   - `geo_tier`     : us_premium | tier_1 | tier_2 | international | unknown
//   - `geo_quality`  : verified | probable | unknown | bot_like
//
// `geo_quality` is the CI-1 trust signal used by the admin funnel + traffic
// classifier. It cross-references the edge country header, the IP forwarding
// chain length, and the user-agent (crawlers/headless => bot_like).
// Never touches checkout, Stripe, or auth. Anonymous, JWT not required.
import { corsHeaders } from '../_shared/cors.ts';

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
 * US-segmented tier label for the admin Clean dashboard.
 * verified_us  : country header says US and chain is single-hop
 * probable_us  : country=US but proxied, or accept-language en-US
 * non_us       : known non-US country
 * bot_like     : crawler/headless UA
 * unknown      : nothing usable
 */
function usTier(country: string | null, xff: string | null, ua: string | null, acceptLang: string | null): string {
  if (ua && BOT_UA.test(ua)) return 'bot_like';
  if (country) {
    const c = country.toUpperCase();
    if (c === 'US') {
      const hops = xff ? xff.split(',').filter(Boolean).length : 1;
      return hops > 2 ? 'probable_us' : 'verified_us';
    }
    return 'non_us';
  }
  if (acceptLang && /^en-us\b/i.test(acceptLang)) return 'probable_us';
  return 'unknown';
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

/** IP-based fallback: many edge providers do not forward cf-ipcountry to
 *  Supabase functions. We hit a free, no-auth geo service with the visitor's
 *  first forwarded IP. Best-effort, never blocks; if it fails we return null
 *  and the caller falls back to accept-language. */
async function ipCountryFallback(xff: string | null, realIp: string | null): Promise<string | null> {
  try {
    const ip = (xff?.split(',')[0]?.trim() || realIp || '').trim();
    if (!ip || ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('::1')) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      const resp = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'getpawsy-geo-classify/1.0' },
      });
      if (!resp.ok) { await resp.text().catch(() => ''); return null; }
      const txt = (await resp.text()).trim();
      // ipapi returns 2-letter country code or 'Undefined'
      if (/^[A-Z]{2}$/.test(txt)) return txt;
      return null;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const h = req.headers;
    let country =
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
    const realIp = h.get('x-real-ip');
    const ua = h.get('user-agent');
    const acceptLang = h.get('accept-language');

    // Fallback: most Supabase fns do not receive cf-ipcountry. Hit IP geo.
    let countrySource: 'header' | 'ip_lookup' | 'accept_language' | 'none' = country ? 'header' : 'none';
    if (!country) {
      const ipCountry = await ipCountryFallback(xff, realIp);
      if (ipCountry) {
        country = ipCountry;
        countrySource = 'ip_lookup';
      } else if (acceptLang && /^en-us\b/i.test(acceptLang)) {
        country = 'US';
        countrySource = 'accept_language';
      }
    }

    const body = {
      country,
      region,
      city,
      geo_tier: tier(country),
      geo_quality: quality(country, xff, ua),
      us_tier: usTier(country, xff, ua, acceptLang),
      country_source: countrySource,
      ts: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        // No public cache — geo varies per visitor IP and IP-lookup must run per session.
        'Cache-Control': 'private, max-age=600',
      },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ country: null, geo_tier: 'unknown', geo_quality: 'unknown', us_tier: 'unknown', country_source: 'none', error: String(e) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});