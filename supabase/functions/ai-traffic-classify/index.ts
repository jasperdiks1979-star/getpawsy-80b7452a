/**
 * ai-traffic-classify
 *
 * Iteration D — Traffic Quality Engine v2.
 *
 * Purpose
 * -------
 * Backfill / refresh `sessions.quality_class` for recent sessions based on
 * signals we already collect (`is_bot`, `bot_reason`, `traffic_quality_score`,
 * `geo_quality`, `user_agent`, `page_view_count`, `event_count`). This is a
 * pure derived classification — it does NOT touch any payment, checkout,
 * Stripe, webhook, or production-critical table. Strictly additive.
 *
 * Buckets (mutually exclusive, in priority order):
 *  - crawler       : known crawler/bot UA OR bot_reason contains "ua:*bot*"
 *  - likely_bot    : is_bot = true OR traffic_quality_score < 30
 *                    OR (event_count = 0 AND page_view_count <= 1 AND
 *                        ua hints at headless/scripted)
 *  - suspicious    : traffic_quality_score in [30,60) OR geo_quality = 'low'
 *                    OR (single hit + no engagement)
 *  - real_human    : everything else with at least one real event
 *
 * Request body (all optional):
 *  { days?: number = 30, limit?: number = 5000, dry_run?: boolean = false,
 *    only_unclassified?: boolean = true }
 *
 * Response: { ok, traceId, scanned, updated, breakdown }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type QualityClass = 'real_human' | 'suspicious' | 'crawler' | 'likely_bot';

type SourceQuality =
  | 'premium'
  | 'good'
  | 'weak'
  | 'curiosity_only'
  | 'suspicious';

interface SessionRow {
  session_id: string;
  is_bot: boolean | null;
  bot_reason: string | null;
  traffic_quality_score: number | null;
  geo_quality: string | null;
  user_agent: string | null;
  page_view_count: number | null;
  event_count: number | null;
  quality_class: string | null;
  source_quality?: string | null;
  in_app_browser?: boolean | null;
  referrer?: string | null;
  last_touch_source?: string | null;
  started_at?: string | null;
  last_seen_at?: string | null;
}

const CRAWLER_UA = /(bot|crawler|spider|scraper|headless|phantom|selenium|puppeteer|playwright|lighthouse|pagespeed|curl|wget|python-requests|go-http-client|okhttp|facebookexternalhit|twitterbot|pinterestbot|tiktokbot|bytespider|googlebot|bingbot|ahrefsbot|semrushbot|yandexbot|duckduckbot|slurp|baiduspider|gptbot|claudebot|perplexitybot)/i;

function classify(row: SessionRow): QualityClass {
  const ua = (row.user_agent || '').toLowerCase();
  const score = row.traffic_quality_score ?? 100;
  const reason = (row.bot_reason || '').toLowerCase();
  const events = row.event_count ?? 0;
  const pvs = row.page_view_count ?? 0;

  if (CRAWLER_UA.test(ua) || /ua:[a-z]*bot/.test(reason)) return 'crawler';
  if (row.is_bot === true || score < 30) return 'likely_bot';
  if (events === 0 && pvs <= 1 && (ua.includes('headless') || ua === '')) {
    return 'likely_bot';
  }
  if (score < 60 || row.geo_quality === 'low' || (events === 0 && pvs <= 1)) {
    return 'suspicious';
  }
  return 'real_human';
}

/**
 * CI-3 — source-quality scoring. Independent of bot classification: a real
 * human can still be `curiosity_only` traffic. Inputs are signals we already
 * persist (dwell, scroll, ATC, in-app browser, geo_quality, utm_source).
 * Returns null when we don't have enough signal yet (caller leaves column).
 */
function scoreSourceQuality(row: SessionRow, cls: QualityClass): SourceQuality | null {
  if (cls === 'crawler' || cls === 'likely_bot') return 'suspicious';
  let dwell = 0;
  if (row.started_at && row.last_seen_at) {
    dwell = Math.max(
      0,
      (new Date(row.last_seen_at).getTime() - new Date(row.started_at).getTime()) / 1000,
    );
  }
  const events = row.event_count ?? 0;
  const pvs = row.page_view_count ?? 0;
  const inApp = row.in_app_browser === true;
  const geo = (row.geo_quality || '').toLowerCase();
  const src = (row.last_touch_source || '').toLowerCase();

  // Not enough signal yet — let the next pass classify.
  if (events === 0 && pvs <= 1 && dwell < 5) return null;

  // High intent — multi-page, long dwell, real geo, organic/direct preferred.
  if (pvs >= 4 && dwell >= 60 && geo !== 'low') return 'premium';
  if (pvs >= 3 || dwell >= 45) return geo === 'low' ? 'weak' : 'good';
  if (inApp && dwell < 15) return 'curiosity_only';
  if (dwell < 10 && pvs <= 1) return 'curiosity_only';
  if (geo === 'low') return 'weak';
  // Pinterest/social drive-bys with a single view → curiosity-only.
  if ((/pinterest|tiktok|instagram|facebook/.test(src)) && pvs <= 1 && dwell < 20) {
    return 'curiosity_only';
  }
  return 'weak';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Admin gate via JWT (matches pattern used by ai-insights-generate).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: 'missing_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: 'invalid_session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin } = await admin.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const days = Math.min(90, Math.max(1, Number(body.days) || 30));
    const limit = Math.min(20000, Math.max(100, Number(body.limit) || 5000));
    const dryRun = body.dry_run === true;
    const onlyUnclassified = body.only_unclassified !== false;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = admin
      .from('sessions')
      .select('session_id, is_bot, bot_reason, traffic_quality_score, geo_quality, user_agent, page_view_count, event_count, quality_class, source_quality, in_app_browser, referrer, last_touch_source, started_at, last_seen_at')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (onlyUnclassified) {
      // Treat a row as unclassified if either column is missing so we can
      // backfill source_quality on rows that already have a quality_class.
      query = query.or('quality_class.is.null,source_quality.is.null');
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const breakdown: Record<QualityClass, number> = {
      real_human: 0, suspicious: 0, crawler: 0, likely_bot: 0,
    };
    const sourceBreakdown: Record<SourceQuality, number> = {
      premium: 0, good: 0, weak: 0, curiosity_only: 0, suspicious: 0,
    };
    const updates: Array<{
      session_id: string;
      quality_class: QualityClass;
      source_quality: SourceQuality | null;
    }> = [];
    for (const r of (rows || []) as SessionRow[]) {
      const cls = classify(r);
      breakdown[cls]++;
      const sq = scoreSourceQuality(r, cls);
      if (sq) sourceBreakdown[sq]++;
      if (r.quality_class !== cls || (sq && r.source_quality !== sq)) {
        updates.push({ session_id: r.session_id, quality_class: cls, source_quality: sq });
      }
    }

    let updated = 0;
    if (!dryRun && updates.length) {
      // Update in chunks to keep payloads small.
      const chunkSize = 500;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        // Use upsert on primary key so we only touch the one column.
        for (const u of chunk) {
          const patch: Record<string, unknown> = { quality_class: u.quality_class };
          if (u.source_quality) patch.source_quality = u.source_quality;
          const { error: uerr } = await admin
            .from('sessions')
            .update(patch)
            .eq('session_id', u.session_id);
          if (!uerr) updated++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        traceId,
        scanned: rows?.length ?? 0,
        updated: dryRun ? 0 : updated,
        dry_run: dryRun,
        days,
        breakdown,
        source_breakdown: sourceBreakdown,
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