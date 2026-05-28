import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * CI-8 — Homepage Variant Event sink.
 *
 * Public endpoint, designed to be hit with navigator.sendBeacon.
 * Records {session_id, variant_key, event_type, product_id?} into
 * public.homepage_variant_events using the service role.
 *
 * Validates event_type against the DB CHECK constraint to avoid 23514s.
 * Always responds 204 on accepted writes (sendBeacon-friendly).
 */

const ALLOWED_EVENTS = new Set([
  'impression',
  'hero_click',
  'pdp_view',
  'atc',
  'purchase',
  'bounce',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405, headers: corsHeaders });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response('bad_json', { status: 400, headers: corsHeaders });
  }

  const variantKey = typeof body.variant_key === 'string' ? body.variant_key : '';
  const eventType = typeof body.event_type === 'string' ? body.event_type : '';
  const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 128) : null;
  const productId =
    typeof body.product_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.product_id)
      ? body.product_id
      : null;

  if (!variantKey || !ALLOWED_EVENTS.has(eventType)) {
    return new Response('invalid', { status: 400, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response('misconfigured', { status: 500, headers: corsHeaders });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    await admin.from('homepage_variant_events').insert({
      session_id: sessionId,
      variant_key: variantKey.slice(0, 256),
      event_type: eventType,
      product_id: productId,
    });
  } catch {
    /* swallow */
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});