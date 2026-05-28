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
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
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
    const url = new URL(req.url);
    const range = (url.searchParams.get('range') || '7d') as Range;
    const generateAi = url.searchParams.get('ai') === '1';
    const persist = url.searchParams.get('persist') === '1';

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const since = sinceFor(range);

    // 1. Pull funnel events (clean, non-bot)
    const { data: events, error } = await supabase
      .from('lp_funnel_events')
      .select('event_name,session_id,product_id,product_name,page_path,utm_source,utm_medium,dwell_ms,raw_payload,is_bot,is_internal,created_at')
      .gte('created_at', since)
      .or('is_bot.is.null,is_bot.eq.false')
      .or('is_internal.is.null,is_internal.eq.false')
      .limit(20000);
    if (error) throw error;

    const rows = events || [];
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

    // 5. Top products
    const byProduct: Record<string, { id: string; name: string; views: number; atc: number; dwellSum: number; dwellN: number; rage: number; sessions: Set<string> }> = {};
    for (const r of rows) {
      if (!r.product_id) continue;
      const key = r.product_id;
      const slot = byProduct[key] || (byProduct[key] = { id: key, name: r.product_name || key, views: 0, atc: 0, dwellSum: 0, dwellN: 0, rage: 0, sessions: new Set() });
      slot.sessions.add(r.session_id);
      if (r.event_name === 'pdp_view' || r.event_name === 'view_item') slot.views++;
      if (r.event_name === 'add_to_cart') slot.atc++;
      if (r.event_name === 'rage_click') slot.rage++;
      if (typeof r.dwell_ms === 'number') { slot.dwellSum += r.dwell_ms; slot.dwellN++; }
    }
    const products = Object.values(byProduct).map(p => ({
      id: p.id,
      name: p.name,
      views: p.views,
      atc: p.atc,
      atc_rate: pct(p.atc, p.views),
      avg_dwell_ms: p.dwellN ? Math.round(p.dwellSum / p.dwellN) : 0,
      rage_clicks: p.rage,
      sessions: p.sessions.size,
    }));
    products.sort((a, b) => b.views - a.views);

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

    const summary = {
      range,
      since,
      total_events: rows.length,
      total_sessions: totalSessions,
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
      breakout_products: [...products].sort((a, b) => b.atc_rate - a.atc_rate).slice(0, 8),
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