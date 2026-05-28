/**
 * ai-landing-match — CI-3 Landing Page Match Analyzer (admin tool).
 *
 * Takes an ad/Pin hook + an optional creative image and a landing URL,
 * fetches the landing page (HTML only, no JS execution), then asks Lovable
 * AI (Gemini 2.5 Flash, structured JSON) to score the ad → landing
 * continuity on three axes: headline, visual, promise clarity. Returns the
 * score + concrete recommendations so the operator can fix drop-offs before
 * spending more on traffic.
 *
 * Strictly admin-only. Draft-only. Never writes to the storefront or to
 * Stripe/checkout tables.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface MatchScore {
  headline_match: number;     // 0-100
  visual_match: number;       // 0-100
  promise_clarity: number;    // 0-100
  overall: number;            // 0-100 (weighted)
  verdict: 'strong' | 'mixed' | 'weak';
  ad_summary: string;
  landing_summary: string;
  mismatches: string[];
  recommendations: string[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline_match', 'visual_match', 'promise_clarity', 'overall',
    'verdict', 'ad_summary', 'landing_summary', 'mismatches', 'recommendations',
  ],
  properties: {
    headline_match: { type: 'integer', minimum: 0, maximum: 100 },
    visual_match: { type: 'integer', minimum: 0, maximum: 100 },
    promise_clarity: { type: 'integer', minimum: 0, maximum: 100 },
    overall: { type: 'integer', minimum: 0, maximum: 100 },
    verdict: { type: 'string', enum: ['strong', 'mixed', 'weak'] },
    ad_summary: { type: 'string' },
    landing_summary: { type: 'string' },
    mismatches: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
  },
};

async function fetchLandingSnapshot(url: string): Promise<{ title: string; h1: string; description: string; text: string }> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GetPawsy-LandingMatch/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  const html = await res.text();
  const pick = (re: RegExp) => (html.match(re)?.[1] || '').trim();
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const h1 = pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '');
  // Strip tags, scripts, styles for a compact text snapshot (max 4kB).
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
  return { title, h1, description, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'missing_auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'invalid_session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!lovableKey) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'ai_unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const landingUrl: string = String(body.landing_url || '').trim();
    const adHook: string = String(body.ad_hook || '').trim();
    const adImageUrl: string | null = body.ad_image_url ? String(body.ad_image_url) : null;
    const adSource: string = String(body.source || 'pinterest').toLowerCase();

    if (!/^https?:\/\//i.test(landingUrl) || !adHook) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const landing = await fetchLandingSnapshot(landingUrl).catch((e) => ({
      title: '', h1: '', description: '', text: `[fetch-failed: ${String(e)}]`,
    }));

    const userParts: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: [
          `Source: ${adSource}`,
          `Ad / Pin hook: ${adHook}`,
          `Landing URL: ${landingUrl}`,
          `Landing <title>: ${landing.title || '(none)'}`,
          `Landing <h1>: ${landing.h1 || '(none)'}`,
          `Landing meta description: ${landing.description || '(none)'}`,
          '',
          'Landing page visible text (truncated):',
          landing.text,
        ].join('\n'),
      },
    ];
    if (adImageUrl) {
      userParts.push({ type: 'image_url', image_url: { url: adImageUrl } });
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: [
              'You are a senior performance-marketing analyst for a premium US pet brand.',
              'Score the continuity between an ad/Pin and the landing page it points to.',
              'Headline match = does the landing headline echo or fulfill the ad hook?',
              'Visual match = does the page hero feel like the same world as the creative?',
              'Promise clarity = is the value prop obvious in the first viewport?',
              'Be specific, blunt, and US-native in tone. Never invent claims.',
              'Return JSON only; no prose. Recommendations must be concrete and actionable.',
            ].join(' '),
          },
          { role: 'user', content: userParts },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'landing_match', schema: SCHEMA, strict: true },
        },
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'rate_limited' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'ai_credits_exhausted' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ ok: false, traceId, message: `ai_error: ${errText.slice(0, 300)}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content;
    let parsed: MatchScore | null = null;
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'ai_parse_error' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        landing_url: landingUrl,
        ad_hook: adHook,
        score: parsed,
        landing_snapshot: { title: landing.title, h1: landing.h1, description: landing.description },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: String(e instanceof Error ? e.message : e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});