/**
 * ai-conversion-engine (CI-4)
 *
 * Pure rules engine — NO LLM calls — that turns existing funnel + session
 * signals into:
 *
 *   1. `conversion_friction` insights (Part 7)
 *      - scroll deep but no ATC reach
 *      - mobile gallery engaged, copy ignored
 *      - TikTok abandon after price view
 *      - source X converts Nx better than source Y
 *
 *   2. `conversion_potential_score` per product (Part 9)
 *      - factors source_quality + emotional engagement + ATC %
 *      - emits labels: breakout, weak, dead_traffic_magnet,
 *        homepage_candidate, ad_scale_candidate
 *
 * Both write into the existing `ai_revenue_insights` table so they flow
 * through `ai-priority-engine` → `ai_priority_queue` automatically. No new
 * dashboards, no new tables.
 *
 * Admin-only. Idempotent: dedupe via (scope, scope_ref, insight_type)
 * within the run window.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const WINDOW_DAYS = 7;
const MIN_PRODUCT_SESSIONS = 25;
const MIN_SOURCE_SESSIONS = 40;

type Json = Record<string, unknown>;

function json(body: Json | { ok: boolean; [k: string]: unknown }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false as const, status: 401, message: 'Missing auth' };
  const userClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return { ok: false as const, status: 401, message: 'Invalid token' };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: isAdmin } = await admin.rpc('has_role', {
    _user_id: user.id,
    _role: 'admin',
  });
  if (!isAdmin)
    return { ok: false as const, status: 403, message: 'Admin only' };
  return { ok: true as const, admin };
}

type Insight = {
  scope: 'product' | 'source' | 'conversion';
  scope_ref: string | null;
  insight_type: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  body: string;
  evidence: Json;
};

/* ---------------- friction rules ---------------- */

type FunnelRow = {
  session_id: string;
  event_name: string;
  product_id: string | null;
  page_path: string | null;
  utm_source: string | null;
  dwell_ms: number | null;
  scroll_depth_at_visible: number | null;
  value: number | null;
  created_at: string;
};

function frictionInsights(rows: FunnelRow[]): Insight[] {
  const out: Insight[] = [];

  // index events per session
  const bySession = new Map<string, FunnelRow[]>();
  for (const r of rows) {
    const arr = bySession.get(r.session_id) ?? [];
    arr.push(r);
    bySession.set(r.session_id, arr);
  }

  // Rule A: scroll deep (>60%) but no ATC anywhere in session
  let deepNoAtc = 0;
  let deepTotal = 0;
  const productNoAtc = new Map<string, number>();
  // Rule B: mobile gallery engaged (gallery_swipe / image_zoom) but no copy reach
  let galleryNoCopy = 0;
  let galleryTotal = 0;
  // Rule C: tiktok abandon after price view
  let ttPriceView = 0;
  let ttAbandon = 0;

  for (const events of bySession.values()) {
    const hasAtc = events.some((e) => e.event_name === 'add_to_cart');
    const maxScroll = events.reduce(
      (m, e) => Math.max(m, e.scroll_depth_at_visible ?? 0),
      0,
    );
    if (maxScroll >= 60) {
      deepTotal++;
      if (!hasAtc) {
        deepNoAtc++;
        const pid = events.find((e) => e.product_id)?.product_id;
        if (pid) productNoAtc.set(pid, (productNoAtc.get(pid) ?? 0) + 1);
      }
    }

    const galleryEngaged = events.some((e) =>
      ['gallery_swipe', 'image_zoom', 'pdp_gallery_view'].includes(e.event_name),
    );
    const copyReached = events.some((e) =>
      ['reassurance_view', 'faq_open', 'description_scroll'].includes(
        e.event_name,
      ),
    );
    if (galleryEngaged) {
      galleryTotal++;
      if (!copyReached) galleryNoCopy++;
    }

    const isTikTok = events.some((e) =>
      (e.utm_source ?? '').toLowerCase().includes('tiktok'),
    );
    if (isTikTok) {
      const sawPrice = events.some((e) =>
        ['price_view', 'pdp_buy_box_view'].includes(e.event_name),
      );
      if (sawPrice) {
        ttPriceView++;
        if (!hasAtc) ttAbandon++;
      }
    }
  }

  // Emit A
  if (deepTotal >= 50 && deepNoAtc / deepTotal >= 0.6) {
    const topProducts = [...productNoAtc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    out.push({
      scope: 'conversion',
      scope_ref: 'friction:scroll_deep_no_atc',
      insight_type: 'conversion_friction',
      severity: 'warn',
      title: 'Visitors scroll deep but never reach the buy box',
      body: `${deepNoAtc} of ${deepTotal} engaged sessions never triggered Add-to-Cart. The buy box is likely too far down or the value prop fades before it.`,
      evidence: {
        rule: 'scroll_deep_no_atc',
        sessions: deepTotal,
        no_atc: deepNoAtc,
        ratio: Math.round((deepNoAtc / deepTotal) * 100) / 100,
        top_products: topProducts.map(([id, n]) => ({ product_id: id, sessions: n })),
        recommendations:
          'Move sticky ATC closer to the gallery; surface the emotional hook above the fold.',
      },
    });
  }

  // Emit B
  if (galleryTotal >= 50 && galleryNoCopy / galleryTotal >= 0.7) {
    out.push({
      scope: 'conversion',
      scope_ref: 'friction:gallery_no_copy',
      insight_type: 'conversion_friction',
      severity: 'info',
      title: 'Mobile shoppers engage gallery but skip the copy',
      body: `${galleryNoCopy} of ${galleryTotal} mobile sessions interact with the gallery but never reach reassurance or FAQ blocks.`,
      evidence: {
        rule: 'gallery_no_copy',
        sessions: galleryTotal,
        no_copy: galleryNoCopy,
        recommendations:
          'Tighten swipe-benefit chips, move one objection-handler above the fold.',
      },
    });
  }

  // Emit C
  if (ttPriceView >= 30 && ttAbandon / ttPriceView >= 0.85) {
    out.push({
      scope: 'conversion',
      scope_ref: 'friction:tiktok_price_abandon',
      insight_type: 'conversion_friction',
      severity: 'warn',
      title: 'TikTok traffic abandons after seeing price',
      body: `${ttAbandon} of ${ttPriceView} TikTok sessions left after the price view — price-anchoring or expectation mismatch.`,
      evidence: {
        rule: 'tiktok_price_abandon',
        sessions: ttPriceView,
        abandons: ttAbandon,
        recommendations:
          'Reinforce shipping/returns next to price for TikTok-sourced landings; consider bundle anchor.',
      },
    });
  }

  return out;
}

/* ---------------- source comparison ---------------- */

type SessionRow = {
  session_id: string;
  first_touch_source: string | null;
  source_quality: string | null;
};

function sourceComparison(
  sessions: SessionRow[],
  funnel: FunnelRow[],
): Insight[] {
  const atcBySession = new Set<string>();
  for (const f of funnel) if (f.event_name === 'add_to_cart') atcBySession.add(f.session_id);

  const bySrc = new Map<
    string,
    { total: number; atc: number; premium: number }
  >();
  for (const s of sessions) {
    const src = (s.first_touch_source ?? 'direct').toLowerCase();
    const cur = bySrc.get(src) ?? { total: 0, atc: 0, premium: 0 };
    cur.total++;
    if (atcBySession.has(s.session_id)) cur.atc++;
    if (s.source_quality === 'premium' || s.source_quality === 'good')
      cur.premium++;
    bySrc.set(src, cur);
  }

  const qualifying = [...bySrc.entries()].filter(
    ([, v]) => v.total >= MIN_SOURCE_SESSIONS,
  );
  if (qualifying.length < 2) return [];

  const withRate = qualifying.map(([src, v]) => ({
    src,
    total: v.total,
    atc: v.atc,
    rate: v.atc / v.total,
    premiumRatio: v.premium / v.total,
  }));

  withRate.sort((a, b) => b.rate - a.rate);
  const best = withRate[0];
  const worst = withRate[withRate.length - 1];

  if (best.rate > 0 && worst.rate >= 0 && best.rate >= (worst.rate || 0.0001) * 3) {
    const mult = worst.rate > 0
      ? Math.round((best.rate / worst.rate) * 10) / 10
      : Math.round(best.rate * 1000) / 10;
    return [
      {
        scope: 'source',
        scope_ref: `${best.src}_vs_${worst.src}`,
        insight_type: 'conversion_friction',
        severity: 'info',
        title: `${best.src} converts ${mult}× better than ${worst.src}`,
        body: `Across ${best.total + worst.total} sessions, ${best.src} reached ATC at ${(best.rate * 100).toFixed(1)}% vs ${(worst.rate * 100).toFixed(1)}% from ${worst.src}.`,
        evidence: {
          rule: 'source_rate_gap',
          best: best,
          worst: worst,
          recommendations: `Shift creative budget from ${worst.src} toward ${best.src} or rework ${worst.src} landing match.`,
        },
      },
    ];
  }
  return [];
}

/* ---------------- product scoring ---------------- */

function productScores(
  funnel: FunnelRow[],
  sessionQuality: Map<string, string | null>,
): Insight[] {
  type Agg = {
    views: number;
    atc: number;
    dwellSum: number;
    dwellN: number;
    sessions: Set<string>;
    premiumSessions: Set<string>;
    emotionalEngaged: Set<string>;
  };
  const by = new Map<string, Agg>();
  for (const r of funnel) {
    if (!r.product_id) continue;
    const a =
      by.get(r.product_id) ??
      ({
        views: 0,
        atc: 0,
        dwellSum: 0,
        dwellN: 0,
        sessions: new Set<string>(),
        premiumSessions: new Set<string>(),
        emotionalEngaged: new Set<string>(),
      } as Agg);
    a.sessions.add(r.session_id);
    if (r.event_name === 'pdp_view' || r.event_name === 'view_item') a.views++;
    if (r.event_name === 'add_to_cart') a.atc++;
    if (
      ['reassurance_view', 'faq_open', 'description_scroll'].includes(
        r.event_name,
      )
    )
      a.emotionalEngaged.add(r.session_id);
    if (typeof r.dwell_ms === 'number') {
      a.dwellSum += r.dwell_ms;
      a.dwellN++;
    }
    const q = sessionQuality.get(r.session_id);
    if (q === 'premium' || q === 'good') a.premiumSessions.add(r.session_id);
    by.set(r.product_id, a);
  }

  const out: Insight[] = [];
  for (const [pid, a] of by) {
    const sessions = a.sessions.size;
    if (sessions < MIN_PRODUCT_SESSIONS) continue;

    const atcRate = a.views > 0 ? a.atc / a.views : 0;
    const premiumRatio = sessions > 0 ? a.premiumSessions.size / sessions : 0;
    const emotionalRatio = sessions > 0 ? a.emotionalEngaged.size / sessions : 0;
    const avgDwell = a.dwellN > 0 ? a.dwellSum / a.dwellN : 0;
    const dwellNorm = Math.min(1, avgDwell / 45000); // 45s cap

    // 0–100
    const score = Math.round(
      (atcRate * 0.55 + premiumRatio * 0.2 + emotionalRatio * 0.15 + dwellNorm * 0.1) *
        100,
    );

    let label: string;
    let severity: Insight['severity'] = 'info';
    if (atcRate >= 0.08 && premiumRatio >= 0.5) {
      label = 'breakout';
      severity = 'critical';
    } else if (atcRate >= 0.05 && sessions >= 100) {
      label = 'ad_scale_candidate';
      severity = 'warn';
    } else if (atcRate >= 0.04 && emotionalRatio >= 0.4) {
      label = 'homepage_candidate';
      severity = 'warn';
    } else if (sessions >= 150 && atcRate < 0.01) {
      label = 'dead_traffic_magnet';
      severity = 'warn';
    } else if (atcRate < 0.005 && sessions >= 80) {
      label = 'weak';
      severity = 'info';
    } else {
      continue; // not interesting enough to surface
    }

    out.push({
      scope: 'product',
      scope_ref: pid,
      insight_type: 'conversion_potential_score',
      severity,
      title: `${pid}: ${label.replace(/_/g, ' ')} (score ${score})`,
      body: `${sessions} sessions, ${(atcRate * 100).toFixed(1)}% ATC, ${(premiumRatio * 100).toFixed(0)}% premium-quality traffic, ${(emotionalRatio * 100).toFixed(0)}% engaged with emotional copy.`,
      evidence: {
        rule: 'conversion_potential_score',
        product_id: pid,
        label,
        score,
        sessions,
        atc_rate: Math.round(atcRate * 1000) / 1000,
        premium_ratio: Math.round(premiumRatio * 100) / 100,
        emotional_ratio: Math.round(emotionalRatio * 100) / 100,
        avg_dwell_ms: Math.round(avgDwell),
        expected_revenue_30d:
          label === 'breakout' || label === 'ad_scale_candidate'
            ? Math.round(sessions * atcRate * 35 * 4) // crude monthly projection
            : 0,
        recommendations:
          label === 'breakout'
            ? 'Promote to hero, scale paid traffic, prioritize content.'
            : label === 'ad_scale_candidate'
              ? 'Increase ad budget; A/B test creative variations.'
              : label === 'homepage_candidate'
                ? 'Feature on homepage; copy already resonates.'
                : label === 'dead_traffic_magnet'
                  ? 'High views, no conversion — review price, hook, intent match.'
                  : 'Demote or de-prioritize; redirect traffic to better SKUs.',
      },
    });
  }
  return out;
}

/* ---------------- persistence ---------------- */

async function persist(
  admin: ReturnType<typeof createClient>,
  insights: Insight[],
) {
  if (!insights.length) return { inserted: 0, skipped: 0 };
  const sinceIso = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // de-dupe against recent identical insights
  const { data: existing } = await admin
    .from('ai_revenue_insights')
    .select('scope,scope_ref,insight_type')
    .gte('generated_at', sinceIso)
    .is('dismissed_at', null);
  const seen = new Set(
    (existing ?? []).map(
      (r: { scope: string; scope_ref: string | null; insight_type: string }) =>
        `${r.scope}|${r.scope_ref ?? ''}|${r.insight_type}`,
    ),
  );

  const fresh = insights.filter(
    (i) => !seen.has(`${i.scope}|${i.scope_ref ?? ''}|${i.insight_type}`),
  );
  if (!fresh.length) return { inserted: 0, skipped: insights.length };

  const windowStart = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const windowEnd = new Date().toISOString();

  const rows = fresh.map((i) => ({
    scope: i.scope,
    scope_ref: i.scope_ref,
    insight_type: i.insight_type,
    severity: i.severity,
    title: i.title,
    body: i.body,
    evidence: i.evidence,
    recommendations: [(i.evidence as Json).recommendations ?? ''].filter(Boolean),
    model: 'rules:ai-conversion-engine@1',
    window_start: windowStart,
    window_end: windowEnd,
  }));

  const { error } = await admin.from('ai_revenue_insights').insert(rows);
  if (error) throw error;
  return { inserted: rows.length, skipped: insights.length - rows.length };
}

/* ---------------- entry ---------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json({ ok: false, error: auth.message }, auth.status);
    const { admin } = auth;

    const sinceIso = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: funnelData } = await admin
      .from('lp_funnel_events')
      .select(
        'session_id,event_name,product_id,page_path,utm_source,dwell_ms,scroll_depth_at_visible,value,created_at',
      )
      .gte('created_at', sinceIso)
      .eq('is_internal', false)
      .limit(20000);

    const { data: sessionData } = await admin
      .from('sessions')
      .select('session_id,first_touch_source,source_quality')
      .gte('started_at', sinceIso)
      .limit(20000);

    const funnel = (funnelData ?? []) as FunnelRow[];
    const sessions = (sessionData ?? []) as SessionRow[];
    const qualityMap = new Map(
      sessions.map((s) => [s.session_id, s.source_quality] as const),
    );

    const all: Insight[] = [
      ...frictionInsights(funnel),
      ...sourceComparison(sessions, funnel),
      ...productScores(funnel, qualityMap),
    ];

    const result = await persist(admin, all);

    return json({
      ok: true,
      window_days: WINDOW_DAYS,
      funnel_events: funnel.length,
      sessions: sessions.length,
      generated: all.length,
      ...result,
    });
  } catch (err) {
    console.error('[ai-conversion-engine] error', err);
    return json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      500,
    );
  }
});