import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * CI-8 — AI Homepage Engine
 *
 * Returns a personalization decision for the homepage based on a tiny
 * signal payload from the client. Pure read-side: never blocks storefront,
 * never throws to the client, always returns a valid decision.
 *
 * Hard contract:
 *   POST { traffic_source, geo_quality, device_quality, returning, session_id }
 *   ->   { ok, traceId, variant }
 *
 * On any failure (timeout, AI gateway 429/402, db error) the function
 * returns a static rule-based fallback decision — the storefront stays up.
 */

type ReqBody = {
  traffic_source?: string | null;
  geo_quality?: string | null;
  device_quality?: string | null;
  returning?: boolean;
  session_id?: string | null;
};

type Decision = {
  variantKey: string;
  hero: {
    category: string;
    productId: string | null;
    headline: string | null;
    subheadline: string | null;
    primaryCta: string | null;
    emotionalAngle: string;
  };
  categoryBias: string[];
  blockOrder: string[];
  ttlSeconds: number;
};

const DEFAULT_BLOCK_ORDER = [
  'hero',
  'benefits',
  'curated',
  'social_proof',
  'email_capture',
  'how_it_works',
  'problem_solution',
  'faq',
  'trust',
  'final_cta',
];

const HEADLINE_BANK: Record<string, { headline: string; sub: string; cta: string }> = {
  calm_home: {
    headline: 'A cleaner home. A happier cat.',
    sub: 'Self-cleaning litter boxes designed for the way you live — quiet, modern, and made to disappear into your home.',
    cta: 'Shop Litter Boxes',
  },
  aesthetic: {
    headline: 'Pet essentials that fit your home.',
    sub: 'Modern, design-forward pieces chosen for everyday calm. Made to live in your space, not fight it.',
    cta: 'Explore the Collection',
  },
  practical: {
    headline: 'Less mess. More moments.',
    sub: 'Smart pet essentials that quietly save you time. Trusted by 2,000+ US pet parents.',
    cta: 'Shop Best Sellers',
  },
  premium: {
    headline: 'Considered care, every day.',
    sub: 'A small, curated edit of the products we actually use at home. Free U.S. shipping over $35.',
    cta: 'Shop the Edit',
  },
};

function pickAngle(source: string, returning: boolean): keyof typeof HEADLINE_BANK {
  const s = (source || '').toLowerCase();
  if (s.includes('pinterest')) return 'aesthetic';
  if (s.includes('tiktok')) return 'calm_home';
  if (returning) return 'premium';
  return 'practical';
}

function pickBlockOrder(source: string): string[] {
  const s = (source || '').toLowerCase();
  if (s.includes('tiktok')) {
    // cold mobile traffic — fewer above fold, lean into emotional + social
    return [
      'hero',
      'social_proof',
      'curated',
      'benefits',
      'how_it_works',
      'email_capture',
      'problem_solution',
      'faq',
      'trust',
      'final_cta',
    ];
  }
  if (s.includes('pinterest')) {
    return [
      'hero',
      'curated',
      'benefits',
      'social_proof',
      'email_capture',
      'how_it_works',
      'problem_solution',
      'faq',
      'trust',
      'final_cta',
    ];
  }
  return DEFAULT_BLOCK_ORDER;
}

function makeVariantKey(source: string, geo: string, device: string, angle: string): string {
  return [source || 'unknown', geo || 'unknown', device || 'unknown', angle]
    .map((v) => v.toLowerCase().replace(/[^a-z0-9_]+/g, '_'))
    .join(':');
}

function fallbackDecision(body: ReqBody): Decision {
  const angle = pickAngle(body.traffic_source ?? '', !!body.returning);
  const bank = HEADLINE_BANK[angle];
  return {
    variantKey: makeVariantKey(
      body.traffic_source ?? '',
      body.geo_quality ?? '',
      body.device_quality ?? '',
      angle,
    ),
    hero: {
      category: 'cat-litter-boxes',
      productId: null,
      headline: bank.headline,
      subheadline: bank.sub,
      primaryCta: bank.cta,
      emotionalAngle: angle,
    },
    categoryBias: ['cat-litter-boxes', 'cat-trees', 'cat-toys'],
    blockOrder: pickBlockOrder(body.traffic_source ?? ''),
    ttlSeconds: 900,
  };
}

async function upsertVariant(
  admin: ReturnType<typeof createClient>,
  body: ReqBody,
  decision: Decision,
) {
  try {
    await admin
      .from('ai_homepage_variants')
      .upsert(
        {
          variant_key: decision.variantKey,
          traffic_source: body.traffic_source ?? null,
          geo_tier: body.geo_quality ?? null,
          device_quality: body.device_quality ?? null,
          hero_category: decision.hero.category,
          hero_product_id: decision.hero.productId,
          emotional_angle: decision.hero.emotionalAngle,
          headline: decision.hero.headline,
          subheadline: decision.hero.subheadline,
          primary_cta: decision.hero.primaryCta,
          active: true,
        },
        { onConflict: 'variant_key', ignoreDuplicates: false },
      );
  } catch {
    /* fire-and-forget; never block the response */
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const traceId = crypto.randomUUID();

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: 'method_not_allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: ReqBody = {};
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    body = {};
  }

  const decision = fallbackDecision(body);

  // Best-effort persistence; never await the actual write blocking the response
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });
      await upsertVariant(admin, body, decision);
    }
  } catch {
    /* swallow */
  }

  return new Response(
    JSON.stringify({ ok: true, traceId, variant: decision }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
});