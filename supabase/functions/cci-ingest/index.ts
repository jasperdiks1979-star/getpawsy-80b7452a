import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED = new Set([
  'page_view',
  'homepage_view','collection_view','product_card_click','product_view',
  'product_image_view','product_gallery_swipe','product_price_visible',
  'shipping_info_visible','returns_info_visible','trust_badge_visible',
  'reviews_section_visible','faq_section_visible','sticky_atc_visible',
  'add_to_cart_click','add_to_cart_success','add_to_cart_error',
  'cart_open','cart_quantity_change','checkout_click','checkout_loaded',
  'checkout_error','checkout_abandoned','payment_redirect_started','payment_success',
  'purchase_confirmed',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch { /* tolerate non-JSON / empty */ }
  const event_name = String(body.event_name ?? '');
  const session_id = String(body.session_id ?? '');
  if (!event_name || !ALLOWED.has(event_name) || !session_id) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_event' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  // Country resolution priority:
  //   1. Explicit body.country (client-side geo via useVisitorTracking cache)
  //   2. Edge headers (works only on Cloudflare / Vercel / some proxies)
  //   3. null (unknown)
  // Supabase Edge Runtime does NOT set cf-ipcountry, so headers-only was
  // always null in production; body.country closes that gap.
  const bodyCountry = typeof body.country === 'string' && body.country.length > 0
    ? String(body.country)
    : null;
  const headerCountry =
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('x-country') ||
    null;
  const country = bodyCountry || headerCountry || null;
  const { error } = await sb.from('cci_events').insert({
    session_id,
    visitor_id: body.visitor_id ? String(body.visitor_id) : null,
    event_name,
    product_id: body.product_id ? String(body.product_id) : null,
    variant_id: body.variant_id ? String(body.variant_id) : null,
    source: body.source ? String(body.source) : null,
    medium: body.medium ? String(body.medium) : null,
    campaign: body.campaign ? String(body.campaign) : null,
    landing_page: body.landing_page ? String(body.landing_page) : null,
    page_path: body.page_path ? String(body.page_path) : null,
    referrer: body.referrer ? String(body.referrer) : null,
    device: body.device ? String(body.device) : null,
    country,
    funnel_stage: body.funnel_stage ? String(body.funnel_stage) : null,
    confidence: typeof body.confidence === 'number' ? body.confidence : null,
    meta: (body.meta && typeof body.meta === 'object') ? body.meta : {},
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});