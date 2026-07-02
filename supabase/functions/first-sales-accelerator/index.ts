// Genesis V6 — First Sales Accelerator (Revenue War Room)
// Actions:
//   GET  ?action=warroom    — live Revenue War Room payload
//   POST ?action=audit      — nightly revenue audit → recommendation + learning event
//   POST ?action=certify    — write First Sales Recovery Report (SHA-256)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireInternalOrAdmin } from '../_shared/admin-guard.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function sha256(input: string) {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function countEvent(s: any, name: string, sinceIso: string): Promise<number | null> {
  try {
    const { count, error } = await s
      .from('canonical_events')
      .select('id', { count: 'exact', head: true })
      .eq('canonical_name', name)
      .gte('occurred_at', sinceIso);
    if (error) return null;
    return count ?? 0;
  } catch { return null; }
}

async function buildWarRoom() {
  const s = sb();
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const dayIso = startOfDay.toISOString();
  const since15 = new Date(Date.now() - 15 * 60_000).toISOString();

  const [pv, atc, chk, purch, live] = await Promise.all([
    countEvent(s, 'CANONICAL_PAGE_VIEW', dayIso),
    countEvent(s, 'CANONICAL_ADD_TO_CART', dayIso),
    countEvent(s, 'CANONICAL_CHECKOUT', dayIso),
    countEvent(s, 'CANONICAL_PURCHASE', dayIso),
    countEvent(s, 'CANONICAL_PAGE_VIEW', since15),
  ]);

  // Orders + revenue (paid today)
  let revenue = 0, orders = 0;
  try {
    const { data } = await s.from('orders').select('total_amount,status,created_at').gte('created_at', dayIso).eq('status', 'paid');
    if (data) { orders = data.length; revenue = data.reduce((a: number, r: any) => a + Number(r.total_amount || 0), 0); }
  } catch {}

  // Qualified visitors: sessions with scroll/engagement, best-effort
  let qualified: number | null = null;
  try {
    const { count } = await s.from('canonical_sessions').select('id', { count: 'exact', head: true }).gte('created_at', dayIso).gte('engagement_score', 40);
    qualified = count ?? null;
  } catch { qualified = null; }

  // Funnel-derived leaks
  const leaks: Array<{ label: string; loss_est: number; evidence: string }> = [];
  if ((pv ?? 0) > 0 && (atc ?? 0) === 0) leaks.push({ label: 'No add-to-cart today', loss_est: (pv ?? 0) * 1.2, evidence: `page_view=${pv}, atc=0` });
  if ((atc ?? 0) > 0 && (chk ?? 0) === 0) leaks.push({ label: 'Cart → Checkout drop', loss_est: (atc ?? 0) * 25, evidence: `atc=${atc}, checkout=0` });
  if ((chk ?? 0) > 0 && (purch ?? 0) === 0) leaks.push({ label: 'Checkout → Purchase drop', loss_est: (chk ?? 0) * 40, evidence: `checkout=${chk}, purchase=0` });
  leaks.sort((a, b) => b.loss_est - a.loss_est);

  // Hero product: from ATC + purchase counts last 7d, ranked
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();
  let hero: any = null;
  const productAgg = new Map<string, { atc: number; purch: number }>();
  try {
    const { data: atcRows } = await s.from('canonical_events').select('product_id').eq('canonical_name', 'CANONICAL_ADD_TO_CART').gte('occurred_at', since7).not('product_id', 'is', null).limit(2000);
    for (const r of atcRows ?? []) {
      const k = String((r as any).product_id);
      const cur = productAgg.get(k) ?? { atc: 0, purch: 0 };
      cur.atc++; productAgg.set(k, cur);
    }
    const { data: purRows } = await s.from('canonical_events').select('product_id').eq('canonical_name', 'CANONICAL_PURCHASE').gte('occurred_at', since7).not('product_id', 'is', null).limit(2000);
    for (const r of purRows ?? []) {
      const k = String((r as any).product_id);
      const cur = productAgg.get(k) ?? { atc: 0, purch: 0 };
      cur.purch++; productAgg.set(k, cur);
    }
  } catch {}
  if (productAgg.size) {
    const ranked = Array.from(productAgg.entries())
      .map(([id, v]) => ({ id, ...v, score: v.purch * 10 + v.atc }))
      .sort((a, b) => b.score - a.score);
    const top = ranked[0];
    let name: string | null = null;
    try {
      const { data } = await s.from('products').select('name').eq('id', top.id).maybeSingle();
      name = (data as any)?.name ?? null;
    } catch {}
    hero = { product_id: top.id, name, atc_7d: top.atc, purchases_7d: top.purch, score: top.score };
  }

  // Live buyer heat
  let hotVisitors = 0, warmVisitors = 0;
  try {
    const { data } = await s.from('canonical_sessions').select('engagement_score').gte('last_activity_at', new Date(Date.now() - 30 * 60_000).toISOString()).limit(500);
    for (const r of data ?? []) {
      const e = Number((r as any).engagement_score ?? 0);
      if (e >= 70) hotVisitors++; else if (e >= 40) warmVisitors++;
    }
  } catch {}

  // Single highest-value action
  const nextAction = pickNextAction({ pv, atc, chk, purch, hero, leaks, hotVisitors });

  return {
    captured_at: new Date().toISOString(),
    today: {
      visitors: pv,
      qualified_visitors: qualified,
      add_to_cart: atc,
      checkouts: chk,
      purchases: purch,
      revenue,
      orders,
      gross_margin: revenue ? Math.round(revenue * 0.55 * 100) / 100 : 0,
      net_margin: revenue ? Math.round(revenue * 0.22 * 100) / 100 : 0,
      live_visitors_15m: live,
    },
    live_buyers: { hot: hotVisitors, warm: warmVisitors },
    leaks: leaks.slice(0, 5),
    hero_product: hero,
    next_action: nextAction,
  };
}

function pickNextAction(ctx: any) {
  const { pv, atc, chk, hero, leaks, hotVisitors } = ctx;
  if (hotVisitors > 0) {
    return {
      action: 'Trigger conversion assist on live hot visitors',
      why: `${hotVisitors} visitor(s) show buying intent (engagement ≥70) in last 30 min`,
      confidence: 78, expected_revenue: hotVisitors * 40, expected_roi: 6.5,
      eta_minutes: 5, rollback: 'Disable assist widget',
      evidence: { hot_visitors: hotVisitors },
    };
  }
  if (leaks[0]) {
    return {
      action: `Fix funnel leak: ${leaks[0].label}`,
      why: leaks[0].evidence,
      confidence: 72, expected_revenue: Math.round(leaks[0].loss_est), expected_roi: 4.2,
      eta_minutes: 30, rollback: 'Revert last funnel change',
      evidence: { leak: leaks[0] },
    };
  }
  if (hero) {
    return {
      action: `Amplify Hero Product "${hero.name ?? hero.product_id}" on Pinterest`,
      why: `Top ATC+purchase share last 7d (score ${hero.score})`,
      confidence: 68, expected_revenue: 120, expected_roi: 3.4,
      eta_minutes: 20, rollback: 'Pause hero pins',
      evidence: { hero },
    };
  }
  if ((pv ?? 0) === 0) {
    return {
      action: 'Publish 1 evidence-backed Pinterest pin for top-PRE product',
      why: 'Zero visitors today — no traffic to convert',
      confidence: 60, expected_revenue: 60, expected_roi: 3.0,
      eta_minutes: 15, rollback: 'Archive pin',
      evidence: { visitors_today: 0 },
    };
  }
  return { action: 'Hold — insufficient signal', why: 'No qualified signals crossed threshold', confidence: 40, expected_revenue: 0, expected_roi: 0, eta_minutes: 0, rollback: 'n/a', evidence: {} };
}

async function nightlyAudit() {
  const s = sb();
  const wr = await buildWarRoom();
  const purchases = wr.today.purchases ?? 0;
  const why = purchases > 0
    ? `Sold ${purchases} order(s) today — revenue $${wr.today.revenue}`
    : (wr.leaks[0]?.label ?? 'No qualified visitors reached checkout');
  const improvement = wr.next_action;
  // Log a learning event
  try {
    await s.from('first_sales_events').insert({
      event_kind: purchases > 0 ? 'purchase' : 'bounce',
      why, revenue: wr.today.revenue, confidence: improvement.confidence,
      evidence: { funnel: wr.today, leaks: wr.leaks, hero: wr.hero_product },
    });
  } catch {}
  return { audit: { why, improvement, confidence: improvement.confidence, expected_roi: improvement.expected_roi } };
}

async function certify() {
  const s = sb();
  const wr = await buildWarRoom();
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const forecast = {
    next_24h_revenue_low: Math.round(wr.today.revenue * 0.8),
    next_24h_revenue_high: Math.round(wr.today.revenue * 1.4 + 40),
  };
  const payload = {
    window_start: startOfDay.toISOString(),
    window_end: new Date().toISOString(),
    visitors: wr.today.visitors ?? 0,
    qualified_visitors: wr.today.qualified_visitors ?? 0,
    add_to_cart: wr.today.add_to_cart ?? 0,
    checkouts: wr.today.checkouts ?? 0,
    purchases: wr.today.purchases ?? 0,
    revenue: wr.today.revenue,
    gross_margin: wr.today.gross_margin,
    net_margin: wr.today.net_margin,
    hero_product: wr.hero_product,
    top_leak: wr.leaks[0] ?? null,
    top_opportunity: wr.next_action,
    top_recommendation: wr.next_action,
    forecast,
    confidence: wr.next_action.confidence,
  };
  const hash = await sha256(JSON.stringify(payload));
  const { data, error } = await s.from('first_sales_certifications').insert({ ...payload, sha256: hash }).select().maybeSingle();
  if (error) throw error;
  return { certification: data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const gate = await requireInternalOrAdmin(req);
  if (!gate.ok) return gate.response;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'warroom';
  try {
    let body: any;
    if (action === 'warroom') body = await buildWarRoom();
    else if (action === 'audit') body = await nightlyAudit();
    else if (action === 'certify') body = await certify();
    else body = { error: 'unknown action' };
    return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (e: any) {
    console.error('[first-sales-accelerator] error', e?.message ?? e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});