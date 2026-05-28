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
      .select('session_id, is_bot, bot_reason, traffic_quality_score, geo_quality, user_agent, page_view_count, event_count, quality_class')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (onlyUnclassified) query = query.is('quality_class', null);

    const { data: rows, error } = await query;
    if (error) throw error;

    const breakdown: Record<QualityClass, number> = {
      real_human: 0, suspicious: 0, crawler: 0, likely_bot: 0,
    };
    const updates: Array<{ session_id: string; quality_class: QualityClass }> = [];
    for (const r of (rows || []) as SessionRow[]) {
      const cls = classify(r);
      breakdown[cls]++;
      if (r.quality_class !== cls) {
        updates.push({ session_id: r.session_id, quality_class: cls });
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
          const { error: uerr } = await admin
            .from('sessions')
            .update({ quality_class: u.quality_class })
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