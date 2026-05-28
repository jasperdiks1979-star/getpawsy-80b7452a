// Geo classification edge function — additive, read-only, non-blocking.
// Returns the visitor's country (from edge headers) plus a `geo_quality`
// bucket used to weight funnel events in the admin dashboard. Never
// touches checkout, Stripe, or auth. Anonymous, JWT not required.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TIER_1 = new Set(['US', 'CA', 'GB', 'AU', 'NZ', 'IE']);
const TIER_2 = new Set([
  'DE', 'FR', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI',
  'CH', 'AT', 'IT', 'ES', 'PT', 'LU', 'JP', 'SG',
]);

function classify(country: string | null): string {
  if (!country) return 'unknown';
  const c = country.toUpperCase();
  if (c === 'US') return 'us_premium';
  if (TIER_1.has(c)) return 'tier_1';
  if (TIER_2.has(c)) return 'tier_2';
  return 'international';
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

    const body = {
      country,
      region,
      city,
      geo_quality: classify(country),
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
      JSON.stringify({ country: null, geo_quality: 'unknown', error: String(e) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  }
});