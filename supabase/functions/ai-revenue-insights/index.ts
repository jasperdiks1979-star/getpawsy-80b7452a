/**
 * ai-revenue-insights — additive analytics + AI insight generator.
 *
 * Reads lp_funnel_events, products_public, and computes:
 *  - funnel ratios (PDP→ATC, ATC→Checkout, Checkout→Payment)
 *  - bounce / rage-click / dwell / return-visitor metrics
 *  - device + traffic-source breakdowns
 *  - top products by views, ATC %, dwell, etc.
 *
 * Optionally calls Lovable AI to generate human-readable insights
 * and persists actionable items into ai_revenue_recommendations.
 *
 * DOES NOT touch Stripe, checkout, webhooks, or any existing tables.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

type Range = '24h' | '7d' | '30d';

function sinceFor(range: Range): string {
  const d = new Date();
  if (range === '24h') d.setHours(d.getHours() - 24);
  else if (range === '7d') d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString();
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Math.round((num / den) * 1000) / 10;
}

function groupCount<T extends string>(rows: any[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = (r?.[field] ?? 'unknown') as string;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function classifySource(row: any): string {
  const src = (row.utm_source || '').toLowerCase();
  const med = (row.utm_medium || '').toLowerCase();
  if (src.includes('tiktok') || med.includes('tiktok')) return 'tiktok';
  if (src.includes('pinterest') || med.includes('pin')) return 'pinterest';
  if (src.includes('google') || med.includes('cpc') || med.includes('paid')) return 'google';
  if (med === 'organic' || src.includes('google.com')) return 'organic';
  if (!src && !med) return 'direct';
  return 'other';
}

/** Aggregate funnel metrics per product_id from a flat event array. */
function aggregateProducts(rows: any[]) {
  const out: Record<string, { id: string; name: string; views: number; atc: number; rage: number; dwellSum: number; dwellN: number; sessions: Set<string> }> = {};
  for (const r of rows) {
    if (!r.product_id) continue;
    const slot = out[r.product_id] || (out[r.product_id] = { id: r.product_id, name: r.product_name || r.product_id, views: 0, atc: 0, rage: 0, dwellSum: 0, dwellN: 0, sessions: new Set() });
    slot.sessions.add(r.session_id);
    if (r.event_name === 'pdp_view' || r.event_name === 'view_item') slot.views++;
    if (r.event_name === 'add_to_cart') slot.atc++;
    if (r.event_name === 'rage_click') slot.rage++;
    if (typeof r.dwell_ms === 'number') { slot.dwellSum += r.dwell_ms; slot.dwellN++; }
  }
  return out;
}

/** Mean + sample standard deviation. */
function meanStd(values: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (values.length < 2) return { mean, std: 0 };
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Wilson lower bound of a binomial proportion at ~95% confidence.
 * Used to rank ATC-rate so low-sample products don't dominate.
 */
function wilsonLower(successes: number, total: number, z = 1.96): number {
  if (!total) return 0;
  const p = successes / total;
  const denom = 1 + z * z / total;
  const center = p + z * z / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
  return Math.max(0, (center - margin) / denom);
}

function deltaPct(current: number, prior: number): number | null {
  if (!prior) return current > 0 ? null : 0; // null = "new" (no prior baseline)
  return Math.round(((current - prior) / prior) * 1000) / 10;
}

async function callLovableAi(prompt: string, system: string): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    // Admin auth guard — this endpoint exposes internal funnel/session/product analytics
    // and (with ?persist=1) writes AI recommendations. Restrict to authenticated admins.
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminCheck = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: roleRow } = await adminCheck
      .from('user_roles').select('role')
      .eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ ok: false, traceId, message: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const url = new URL(req.url);
    const range = (url.searchParams.get('range') || '7d') as Range;
    const generateAi = url.searchParams.get('ai') === '1';
    const persist = url.searchParams.get('persist') === '1';
    // Optional explicit date window (ISO). When provided, overrides `range`.
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    // Optional source filter: tiktok | pinterest | google | organic | direct | other | all
    const sourceFilter = (url.searchParams.get('source') || 'all').toLowerCase();
    // Optional product drilldown — when set, the function returns a focused
    // current-vs-prior comparison for that single product plus example sessions.
    const drilldownId = url.searchParams.get('drilldown');

    // Adjustable significance thresholds for product classification. Each
    // has a sensible default but can be overridden per request from the
    // dashboard's "Thresholds" control.
    const numParam = (key: string, fallback: number): number => {
      const raw = url.searchParams.get(key);
      if (raw == null || raw === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    const thresholds = {
      min_views: Math.max(1, Math.round(numParam('min_views', 5))),
      min_prior_views: Math.max(1, Math.round(numParam('min_prior_views', 5))),
      winner_atc_z: numParam('winner_atc_z', 1),
      winner_views_z: numParam('winner_views_z', 0),
      breakout_views_z: numParam('breakout_views_z', 1),
      breakout_views_delta_pct: numParam('breakout_views_delta_pct', 200),
      rising_atc_z: numParam('rising_atc_z', 0.5),
      rising_min_views: Math.max(1, Math.round(numParam('rising_min_views', 3))),
      falling_delta_pct: numParam('falling_delta_pct', -30),
    };

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const since = fromParam || sinceFor(range);
    const until = toParam || null;

    // Compute prior period for trend comparisons.
    // Default: equal-length window immediately before `since`.
    // Override: explicit prior_from / prior_to ISO timestamps when
    // prior_mode=custom is supplied from the dashboard.
    const sinceMs = new Date(since).getTime();
    const untilMs = until ? new Date(until).getTime() : Date.now();
    const windowMs = Math.max(1, untilMs - sinceMs);
    const priorMode = (url.searchParams.get('prior_mode') || 'equal').toLowerCase();
    const priorFromParam = url.searchParams.get('prior_from');
    const priorToParam = url.searchParams.get('prior_to');
    let priorSince: string;
    let priorUntil: string;
    if (priorMode === 'custom' && priorFromParam && priorToParam) {
      const pFromMs = new Date(priorFromParam).getTime();
      const pToMs = new Date(priorToParam).getTime();
      if (Number.isFinite(pFromMs) && Number.isFinite(pToMs) && pToMs > pFromMs) {
        priorSince = new Date(pFromMs).toISOString();
        priorUntil = new Date(pToMs).toISOString();
      } else {
        priorUntil = new Date(sinceMs).toISOString();
        priorSince = new Date(sinceMs - windowMs).toISOString();
      }
    } else {
      priorUntil = new Date(sinceMs).toISOString();
      priorSince = new Date(sinceMs - windowMs).toISOString();
    }

    const SELECT_COLS = 'event_name,session_id,product_id,product_name,page_path,utm_source,utm_medium,dwell_ms,raw_payload,is_bot,is_internal,created_at';
    const fetchEvents = async (gte: string, lte: string | null) => {
      let q = supabase
        .from('lp_funnel_events')
        .select(SELECT_COLS)
        .gte('created_at', gte)
        .or('is_bot.is.null,is_bot.eq.false')
        .or('is_internal.is.null,is_internal.eq.false')
        .limit(20000);
      if (lte) q = q.lte('created_at', lte);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []);
    };

    // Companion fetch — counts bot-flagged events in the same window so the
    // dashboard can show bot_filtered_pct without trusting client signals.
    const countBotEvents = async (gte: string, lte: string | null): Promise<number> => {
      let q = supabase
        .from('lp_funnel_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', gte)
        .eq('is_bot', true);
      if (lte) q = q.lte('created_at', lte);
      const { count } = await q;
      return count ?? 0;
    };

    // --- Product drilldown mode -------------------------------------------
    // Lightweight, focused payload for the UI's per-product comparison panel.
    if (drilldownId) {
      const [curAll, priAll] = await Promise.all([
        fetchEvents(since, until),
        fetchEvents(priorSince, priorUntil),
      ]);
      const applySource = (arr: any[]) =>
        sourceFilter && sourceFilter !== 'all'
          ? arr.filter((r) => classifySource(r) === sourceFilter)
          : arr;
      const curRows = applySource(curAll);
      const priRows = applySource(priAll);

      // Sessions that touched this product, with their full event timeline
      // (so we can show what happened around the views/ATCs/rage clicks).
      const productSessionIds = new Set(
        curRows.filter((r) => r.product_id === drilldownId).map((r) => r.session_id),
      );
      const sessionEvents = new Map<string, any[]>();
      for (const r of curRows) {
        if (!productSessionIds.has(r.session_id)) continue;
        const arr = sessionEvents.get(r.session_id) || [];
        arr.push(r);
        sessionEvents.set(r.session_id, arr);
      }

      const summarizeFor = (rows: any[]) => {
        const own = rows.filter((r) => r.product_id === drilldownId);
        const views = own.filter(
          (r) => r.event_name === 'pdp_view' || r.event_name === 'view_item',
        ).length;
        const atc = own.filter((r) => r.event_name === 'add_to_cart').length;
        const rage = own.filter((r) => r.event_name === 'rage_click').length;
        const sessions = new Set(own.map((r) => r.session_id)).size;
        const dwellVals = own
          .map((r) => (typeof r.dwell_ms === 'number' ? r.dwell_ms : null))
          .filter((v): v is number => v != null);
        const avgDwell = dwellVals.length
          ? Math.round(dwellVals.reduce((a, b) => a + b, 0) / dwellVals.length)
          : 0;
        return {
          views,
          atc,
          atc_rate_pct: pct(atc, views),
          rage_clicks: rage,
          avg_dwell_ms: avgDwell,
          sessions,
        };
      };

      const current = summarizeFor(curRows);
      const prior = summarizeFor(priRows);
      const productName =
        curRows.find((r) => r.product_id === drilldownId)?.product_name ||
        priRows.find((r) => r.product_id === drilldownId)?.product_name ||
        drilldownId;

      // Pick up to 6 example sessions — prioritise those that ATC'd, then by
      // event depth, so reviewers see meaningful funnels first.
      const exampleSessions = Array.from(sessionEvents.entries())
        .map(([sid, evts]) => {
          const sorted = [...evts].sort(
            (a, b) => +new Date(a.created_at) - +new Date(b.created_at),
          );
          const own = sorted.filter((r) => r.product_id === drilldownId);
          return {
            session_id: sid,
            started_at: sorted[0]?.created_at ?? null,
            ended_at: sorted[sorted.length - 1]?.created_at ?? null,
            event_count: sorted.length,
            views: own.filter((r) => r.event_name === 'pdp_view' || r.event_name === 'view_item').length,
            atc: own.filter((r) => r.event_name === 'add_to_cart').length,
            rage: own.filter((r) => r.event_name === 'rage_click').length,
            source: classifySource(sorted[0] || {}),
            landing_path: sorted[0]?.page_path ?? null,
            timeline: sorted.slice(0, 25).map((r) => ({
              event: r.event_name,
              path: r.page_path,
              dwell_ms: r.dwell_ms ?? null,
              product_id: r.product_id ?? null,
              at: r.created_at,
            })),
          };
        })
        .sort((a, b) => (b.atc - a.atc) || (b.event_count - a.event_count))
        .slice(0, 6);

      const deltas = {
        views_delta_pct: deltaPct(current.views, prior.views),
        atc_delta_pct: deltaPct(current.atc, prior.atc),
        atc_rate_delta_pp:
          Math.round((current.atc_rate_pct - prior.atc_rate_pct) * 10) / 10,
        dwell_delta_pct: deltaPct(current.avg_dwell_ms, prior.avg_dwell_ms),
        rage_delta_pct: deltaPct(current.rage_clicks, prior.rage_clicks),
        sessions_delta_pct: deltaPct(current.sessions, prior.sessions),
      };

      return new Response(
        JSON.stringify({
          ok: true,
          traceId,
          drilldown: {
            product_id: drilldownId,
            product_name: productName,
            window: { since, until: until ?? new Date(untilMs).toISOString() },
            prior_window: { since: priorSince, until: priorUntil },
            source: sourceFilter,
            current,
            prior,
            deltas,
            example_sessions: exampleSessions,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // --- end drilldown mode -----------------------------------------------

    // 1. Pull current + prior funnel events in parallel
    const [currentEvents, priorEvents, botEventCount] = await Promise.all([
      fetchEvents(since, until),
      fetchEvents(priorSince, priorUntil),
      countBotEvents(since, until).catch(() => 0),
    ]);
    const events = currentEvents;

    let rows = events || [];
    let priorRows = priorEvents;
    if (sourceFilter && sourceFilter !== 'all') {
      rows = rows.filter(r => classifySource(r) === sourceFilter);
      priorRows = priorRows.filter(r => classifySource(r) === sourceFilter);
    }
    const sessions = new Map<string, any[]>();
    for (const r of rows) {
      const arr = sessions.get(r.session_id) || [];
      arr.push(r);
      sessions.set(r.session_id, arr);
    }

    // 2. Funnel ratios
    const pdpViews = rows.filter(r => r.event_name === 'pdp_view' || r.event_name === 'view_item').length;
    const atcs = rows.filter(r => r.event_name === 'add_to_cart').length;
    const checkouts = rows.filter(r => r.event_name === 'begin_checkout').length;
    const payments = rows.filter(r => r.event_name === 'payment_success' || r.event_name === 'purchase').length;
    const cartOpens = rows.filter(r => r.event_name === 'cart_open').length;
    const bounces = rows.filter(r => r.event_name === 'session_bounce').length;
    const rage = rows.filter(r => r.event_name === 'rage_click').length;
    const stickyViews = rows.filter(r => r.event_name === 'sticky_atc_view').length;

    const totalSessions = sessions.size;
    const returnVisits = rows.filter(r => r.event_name === 'return_visit').length;

    // 3. Device & OS split (from raw_payload)
    const deviceCount: Record<string, number> = {};
    const osCount: Record<string, number> = {};
    for (const r of rows) {
      const dev = r.raw_payload?.device || 'unknown';
      const os = r.raw_payload?.os || 'unknown';
      deviceCount[dev] = (deviceCount[dev] || 0) + 1;
      osCount[os] = (osCount[os] || 0) + 1;
    }

    // 3b. Device / OS conversion splits (mobile vs desktop, iOS vs Android).
    // Each slice tracks PDP views + ATCs so we can show actual conversion
    // rates, not just raw event counts. Sessions are deduped per slice.
    type Slice = { views: number; atc: number; checkouts: number; sessions: Set<string> };
    const mkSlice = (): Slice => ({ views: 0, atc: 0, checkouts: 0, sessions: new Set() });
    const devSlices: Record<string, Slice> = {};
    const osSlices: Record<string, Slice> = {};
    const normOs = (raw: string): string => {
      const o = (raw || '').toLowerCase();
      if (o.includes('ios') || o.includes('iphone') || o.includes('ipad')) return 'ios';
      if (o.includes('android')) return 'android';
      if (o.includes('mac')) return 'macos';
      if (o.includes('win')) return 'windows';
      if (o.includes('linux')) return 'linux';
      return 'other';
    };
    const normDev = (raw: string): string => {
      const d = (raw || '').toLowerCase();
      if (d.includes('mobile') || d.includes('phone')) return 'mobile';
      if (d.includes('tablet') || d.includes('ipad')) return 'tablet';
      if (d.includes('desktop')) return 'desktop';
      return 'other';
    };
    for (const r of rows) {
      const d = normDev(r.raw_payload?.device || 'unknown');
      const o = normOs(r.raw_payload?.os || 'unknown');
      const ds = devSlices[d] || (devSlices[d] = mkSlice());
      const os2 = osSlices[o] || (osSlices[o] = mkSlice());
      ds.sessions.add(r.session_id);
      os2.sessions.add(r.session_id);
      if (r.event_name === 'pdp_view' || r.event_name === 'view_item') { ds.views++; os2.views++; }
      if (r.event_name === 'add_to_cart') { ds.atc++; os2.atc++; }
      if (r.event_name === 'begin_checkout') { ds.checkouts++; os2.checkouts++; }
    }
    const sliceToRow = (k: string, s: Slice) => ({
      key: k,
      sessions: s.sessions.size,
      views: s.views,
      atc: s.atc,
      checkouts: s.checkouts,
      atc_rate_pct: pct(s.atc, s.views),
      checkout_rate_pct: pct(s.checkouts, s.atc),
    });
    const deviceSplit = Object.entries(devSlices).map(([k, s]) => sliceToRow(k, s)).sort((a, b) => b.sessions - a.sessions);
    const osSplit = Object.entries(osSlices).map(([k, s]) => sliceToRow(k, s)).sort((a, b) => b.sessions - a.sessions);

    // 4. Source breakdown
    const sourceCounts: Record<string, { sessions: Set<string>; views: number; atc: number; bounce: number; dwellSum: number; dwellN: number }> = {};
    for (const r of rows) {
      const s = classifySource(r);
      const slot = sourceCounts[s] || (sourceCounts[s] = { sessions: new Set(), views: 0, atc: 0, bounce: 0, dwellSum: 0, dwellN: 0 });
      slot.sessions.add(r.session_id);
      if (r.event_name === 'pdp_view' || r.event_name === 'view_item') slot.views++;
      if (r.event_name === 'add_to_cart') slot.atc++;
      if (r.event_name === 'session_bounce') slot.bounce++;
      if (typeof r.dwell_ms === 'number') { slot.dwellSum += r.dwell_ms; slot.dwellN++; }
    }
    const trafficQuality = Object.entries(sourceCounts).map(([source, s]) => ({
      source,
      sessions: s.sessions.size,
      views: s.views,
      atc_rate: pct(s.atc, s.views),
      bounce_rate: pct(s.bounce, s.sessions.size),
      avg_dwell_ms: s.dwellN ? Math.round(s.dwellSum / s.dwellN) : 0,
    })).sort((a, b) => b.sessions - a.sessions);

    // 5. Top products + statistical baselines vs prior period
    const currentAgg = aggregateProducts(rows);
    const priorAgg = aggregateProducts(priorRows);

    // Baseline distributions across the current set (mean / std for z-scores)
    const allViews = Object.values(currentAgg).map(p => p.views);
    const allAtcRates = Object.values(currentAgg)
      .filter(p => p.views >= 3)
      .map(p => p.atc / p.views);
    const viewsStats = meanStd(allViews);
    const atcRateStats = meanStd(allAtcRates);
    const overallAtcRate = pdpViews ? atcs / pdpViews : 0;

    const products = Object.values(currentAgg).map(p => {
      const prior = priorAgg[p.id];
      const priorViews = prior?.views ?? 0;
      const priorAtc = prior?.atc ?? 0;
      const priorAtcRate = priorViews ? priorAtc / priorViews : 0;
      const atcRate = p.views ? p.atc / p.views : 0;
      const viewsZ = viewsStats.std ? (p.views - viewsStats.mean) / viewsStats.std : 0;
      const atcRateZ = atcRateStats.std && p.views >= 3 ? (atcRate - atcRateStats.mean) / atcRateStats.std : 0;
      const wilson = wilsonLower(p.atc, p.views);
      const isNew = priorViews === 0 && p.views > 0;
      const viewsDeltaPct = deltaPct(p.views, priorViews);
      const atcRateDeltaPp = Math.round((atcRate - priorAtcRate) * 1000) / 10; // percentage points

      // Classification (statistically grounded, fully tunable from the UI).
      // All cutoffs live in `thresholds` so analysts can tighten/loosen them
      // without redeploying the function.
      let classification: 'winner' | 'breakout' | 'rising' | 'falling' | 'stable' = 'stable';
      if (
        viewsZ >= thresholds.winner_views_z &&
        p.views >= thresholds.min_views &&
        wilson >= overallAtcRate &&
        atcRateZ >= thresholds.winner_atc_z
      ) {
        classification = 'winner';
      } else if (
        viewsZ >= thresholds.breakout_views_z &&
        (isNew || (viewsDeltaPct !== null && viewsDeltaPct >= thresholds.breakout_views_delta_pct))
      ) {
        classification = 'breakout';
      } else if (
        p.views >= thresholds.rising_min_views &&
        atcRateZ >= thresholds.rising_atc_z &&
        (viewsDeltaPct === null || viewsDeltaPct > 0)
      ) {
        classification = 'rising';
      } else if (
        priorViews >= thresholds.min_prior_views &&
        viewsDeltaPct !== null &&
        viewsDeltaPct <= thresholds.falling_delta_pct
      ) {
        classification = 'falling';
      }

      return {
        id: p.id,
        name: p.name,
        views: p.views,
        atc: p.atc,
        atc_rate: pct(p.atc, p.views),
        avg_dwell_ms: p.dwellN ? Math.round(p.dwellSum / p.dwellN) : 0,
        rage_clicks: p.rage,
        sessions: p.sessions.size,
        prior_views: priorViews,
        prior_atc_rate: Math.round(priorAtcRate * 1000) / 10,
        views_delta_pct: viewsDeltaPct,
        atc_rate_delta_pp: atcRateDeltaPp,
        views_z: Math.round(viewsZ * 100) / 100,
        atc_rate_z: Math.round(atcRateZ * 100) / 100,
        wilson_atc_lower: Math.round(wilson * 1000) / 10,
        is_new: isNew,
        classification,
        // ---- Winner v2 derived scores (0-100). Additive, never breaking. ----
        // Winner Score: composite of statistical strength (z-scores), conversion
        // confidence (Wilson lower bound vs overall), and traffic volume.
        // Trend Velocity: momentum of view growth vs prior window, log-scaled.
        // Conversion Momentum: change in ATC rate (pp) normalised to overall rate.
        winner_score: (() => {
          const volume = Math.max(0, Math.min(1, p.views / Math.max(10, viewsStats.mean * 2)));
          const zPart = Math.max(0, Math.min(1, (viewsZ + atcRateZ + 2) / 6));
          const confPart = overallAtcRate > 0
            ? Math.max(0, Math.min(1, wilson / Math.max(overallAtcRate, 0.01)))
            : 0;
          return Math.round((0.45 * zPart + 0.35 * confPart + 0.2 * volume) * 100);
        })(),
        trend_velocity: (() => {
          if (viewsDeltaPct === null) return isNew && p.views >= 3 ? 80 : 0;
          // Map -100..+500 % delta to 0..100 via log-ish curve.
          const d = Math.max(-100, Math.min(500, viewsDeltaPct));
          const raw = d <= 0
            ? 50 + d * 0.5            // -100 -> 0, 0 -> 50
            : 50 + Math.log10(1 + d) * 18; // +500 -> ~99
          return Math.max(0, Math.min(100, Math.round(raw)));
        })(),
        conversion_momentum: (() => {
          if (priorViews < 3 || p.views < 3) return 50;
          const denom = Math.max(1, overallAtcRate * 100); // pp
          const norm = atcRateDeltaPp / denom;
          return Math.max(0, Math.min(100, Math.round(50 + norm * 25)));
        })(),
      };
    });
    products.sort((a, b) => b.views - a.views);

    const winners = products.filter(p => p.classification === 'winner').sort((a, b) => b.wilson_atc_lower - a.wilson_atc_lower).slice(0, 8);
    const breakouts = products.filter(p => p.classification === 'breakout').sort((a, b) => (b.views_delta_pct ?? 9999) - (a.views_delta_pct ?? 9999)).slice(0, 8);
    const risingProducts = products.filter(p => p.classification === 'rising').sort((a, b) => b.atc_rate_z - a.atc_rate_z).slice(0, 8);
    const fallingProducts = products.filter(p => p.classification === 'falling').sort((a, b) => (a.views_delta_pct ?? 0) - (b.views_delta_pct ?? 0)).slice(0, 8);

    // 6. Top landing & exit pages
    const landing: Record<string, number> = {};
    const exit: Record<string, number> = {};
    for (const [, evts] of sessions) {
      const sorted = evts.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      const first = sorted[0]?.page_path;
      const last = sorted[sorted.length - 1]?.page_path;
      if (first) landing[first] = (landing[first] || 0) + 1;
      if (last) exit[last] = (exit[last] || 0) + 1;
    }
    const topLanding = Object.entries(landing).map(([p, c]) => ({ path: p, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);
    const topExit = Object.entries(exit).map(([p, c]) => ({ path: p, count: c })).sort((a, b) => b.count - a.count).slice(0, 10);

    // 7. Derived quality scores (0-100). Each is a clamped, weighted blend of
    // signals already computed above. These are *directional* — they help
    // operators spot regressions; they are not statistical truth.
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const score100 = (n: number) => Math.round(clamp01(n) * 100);

    // Funnel friction: penalises drop-offs at each stage + rage clicks.
    const pdpAtc01 = pdpViews ? atcs / pdpViews : 0;
    const atcCo01 = atcs ? checkouts / atcs : 0;
    const coPay01 = checkouts ? payments / checkouts : 0;
    const ragePenalty = totalSessions ? Math.min(1, rage / totalSessions) : 0;
    const funnelFrictionScore = score100(
      0.30 * pdpAtc01 * 5 + // ATC rates are small — scale up
      0.30 * atcCo01 +
      0.25 * coPay01 +
      0.15 * (1 - ragePenalty)
    );

    // PDP quality: dwell + ATC rate + low rage.
    const avgDwellMs = (() => {
      const arr = rows.map(r => (typeof r.dwell_ms === 'number' ? r.dwell_ms : null)).filter((v): v is number => v != null);
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    })();
    const pdpQualityScore = score100(
      0.40 * Math.min(1, avgDwellMs / 30000) + // 30s = perfect
      0.40 * pdpAtc01 * 5 +
      0.20 * (1 - ragePenalty)
    );

    // Mobile conversion: ATC rate of mobile slice relative to overall.
    const mobileSlice = devSlices['mobile'];
    const mobileAtc01 = mobileSlice && mobileSlice.views ? mobileSlice.atc / mobileSlice.views : 0;
    const mobileConversionScore = score100(
      0.60 * mobileAtc01 * 5 +
      0.40 * (mobileSlice ? mobileSlice.sessions.size / Math.max(1, totalSessions) : 0)
    );

    // Traffic quality: low bounce + decent dwell + low bot %.
    const botFilteredPct = pct(botEventCount, botEventCount + rows.length);
    const bouncePenalty = totalSessions ? Math.min(1, bounces / totalSessions) : 0;
    const trafficQualityScore = score100(
      0.45 * (1 - bouncePenalty) +
      0.30 * Math.min(1, avgDwellMs / 20000) +
      0.25 * (1 - Math.min(1, botFilteredPct / 50))
    );

    const qualityScores = {
      funnel_friction: funnelFrictionScore,
      pdp_quality: pdpQualityScore,
      mobile_conversion: mobileConversionScore,
      traffic_quality: trafficQualityScore,
    };

    const summary = {
      range,
      since,
      until,
      source: sourceFilter,
      total_events: rows.length,
      total_sessions: totalSessions,
      bot_filtered_events: botEventCount,
      bot_filtered_pct: botFilteredPct,
      quality_scores: qualityScores,
      device_split: deviceSplit,
      os_split: osSplit,
      baselines: {
        prior_mode: priorMode === 'custom' && priorFromParam && priorToParam ? 'custom' : 'equal',
        prior_since: priorSince,
        prior_until: priorUntil,
        prior_events: priorRows.length,
        overall_atc_rate_pct: Math.round(overallAtcRate * 1000) / 10,
        product_views_mean: Math.round(viewsStats.mean * 10) / 10,
        product_views_std: Math.round(viewsStats.std * 10) / 10,
        product_atc_rate_mean_pct: Math.round(atcRateStats.mean * 1000) / 10,
        product_atc_rate_std_pp: Math.round(atcRateStats.std * 1000) / 10,
        sample_size: products.length,
      },
      thresholds,
      funnel: {
        pdp_views: pdpViews,
        cart_opens: cartOpens,
        add_to_cart: atcs,
        begin_checkout: checkouts,
        payment_success: payments,
        pdp_to_atc_pct: pct(atcs, pdpViews),
        atc_to_checkout_pct: pct(checkouts, atcs),
        checkout_to_payment_pct: pct(payments, checkouts),
      },
      behavior: {
        bounce_rate_pct: pct(bounces, totalSessions),
        rage_click_pct: pct(rage, totalSessions),
        sticky_atc_views: stickyViews,
        return_visit_pct: pct(returnVisits, totalSessions),
      },
      devices: deviceCount,
      os: osCount,
      traffic_quality: trafficQuality,
      top_products: products.slice(0, 12),
      breakout_products: breakouts,
      winner_products: winners,
      rising_products: risingProducts,
      falling_products: fallingProducts,
      best_dwell: [...products].sort((a, b) => b.avg_dwell_ms - a.avg_dwell_ms).slice(0, 8),
      worst_rage: [...products].sort((a, b) => b.rage_clicks - a.rage_clicks).slice(0, 8),
      top_landing: topLanding,
      top_exit: topExit,
    };

    let aiInsights: string[] | null = null;
    if (generateAi) {
      const sys = `You are GetPawsy's senior growth analyst.
Given a JSON snapshot of funnel metrics, return STRICT JSON with the shape:
{"insights":[{"title":"...","body":"...","severity":"info|warning|critical","category":"conversion|ux|seo|landing|trust|cta|content","product_id":null}, ...]}.
- 5 to 10 items, ranked by revenue impact.
- Title under 70 chars. Body 1-2 sentences, specific and actionable.
- Use the real numbers in body where relevant.
- No markdown, no preamble, JSON only.`;
      const txt = await callLovableAi(JSON.stringify(summary), sys);
      if (txt) {
        try {
          const m = txt.match(/\{[\s\S]*\}$/m) || [txt];
          const parsed = JSON.parse(m[0]);
          const items = Array.isArray(parsed?.insights) ? parsed.insights : [];
          aiInsights = items;
          if (persist && items.length) {
            await supabase.from('ai_revenue_recommendations').insert(
              items.slice(0, 20).map((it: any) => ({
                category: String(it.category || 'conversion').slice(0, 40),
                severity: ['info', 'warning', 'critical'].includes(it.severity) ? it.severity : 'info',
                title: String(it.title || '').slice(0, 200),
                body: String(it.body || '').slice(0, 2000),
                product_id: it.product_id ? String(it.product_id).slice(0, 200) : null,
                metric_snapshot: summary.funnel,
              }))
            );
          }
        } catch (_e) {
          aiInsights = [{ title: 'AI raw output', body: txt.slice(0, 500), severity: 'info', category: 'conversion' } as any];
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, traceId, summary, ai_insights: aiInsights }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});