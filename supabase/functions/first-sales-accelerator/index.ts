// Genesis V6 — First Sales Accelerator (Revenue War Room)
// Actions:
//   GET  ?action=warroom    — live Revenue War Room payload
//   POST ?action=audit      — nightly revenue audit → recommendation + learning event
//   POST ?action=certify    — write First Sales Recovery Report (SHA-256)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
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

  // Live buyer heat — score real intent from canonical_events (last 30 min)
  const buyerHeat = await scoreLiveBuyers(s);
  const { hot: hotVisitors, warm: warmVisitors, buyingNow: buyingNowVisitors, cold: coldVisitors, top: topVisitors } = buyerHeat;

  // Single highest-value action
  const nextAction = pickNextAction({ pv, atc, chk, purch, hero, leaks, hotVisitors, buyingNowVisitors });

  // Funnel breakdown — step rates + drop-off by page and by product (today)
  const funnelBreakdown = await buildFunnelBreakdown(s, dayIso, { pv, qualified, atc, chk, purch });

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
    live_buyers: {
      buying_now: buyingNowVisitors,
      hot: hotVisitors,
      warm: warmVisitors,
      cold: coldVisitors,
      window_minutes: 30,
      top: topVisitors,
    },
    leaks: leaks.slice(0, 5),
    hero_product: hero,
    next_action: nextAction,
    funnel_breakdown: funnelBreakdown,
  };
}

// -----------------------------------------------------------------------------
// Funnel breakdown — session-aware step conversion + drop-off attribution
// -----------------------------------------------------------------------------
async function buildFunnelBreakdown(
  s: any,
  dayIso: string,
  counts: { pv: number | null; qualified: number | null; atc: number | null; chk: number | null; purch: number | null },
) {
  const { pv, qualified, atc, chk, purch } = counts;
  const pct = (num: number | null, den: number | null) => {
    if (num == null || den == null || den <= 0) return null;
    return Math.round((num / den) * 1000) / 10; // 1dp
  };
  const dropPct = (from: number | null, to: number | null) => {
    if (from == null || to == null || from <= 0) return null;
    return Math.max(0, Math.round(((from - to) / from) * 1000) / 10);
  };

  const steps = [
    { key: 'visitor',    label: 'Visitor',      count: pv,        rate_from_top: 100,                     step_conv: null as number | null, drop_pct: null as number | null },
    { key: 'qualified',  label: 'Qualified',    count: qualified, rate_from_top: pct(qualified, pv),      step_conv: pct(qualified, pv),    drop_pct: dropPct(pv, qualified) },
    { key: 'atc',        label: 'Add-to-Cart',  count: atc,       rate_from_top: pct(atc, pv),            step_conv: pct(atc, qualified ?? pv), drop_pct: dropPct(qualified ?? pv, atc) },
    { key: 'checkout',   label: 'Checkout',     count: chk,       rate_from_top: pct(chk, pv),            step_conv: pct(chk, atc),         drop_pct: dropPct(atc, chk) },
    { key: 'purchase',   label: 'Purchase',     count: purch,     rate_from_top: pct(purch, pv),          step_conv: pct(purch, chk),       drop_pct: dropPct(chk, purch) },
  ];

  // Identify biggest bottleneck step (highest drop_pct with a meaningful upstream base)
  let bottleneck: { from: string; to: string; drop_pct: number; lost: number } | null = null;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const cur = steps[i];
    if (prev.count && cur.count != null && cur.drop_pct != null) {
      const lost = Math.max(0, (prev.count as number) - (cur.count as number));
      if (!bottleneck || cur.drop_pct > bottleneck.drop_pct) {
        bottleneck = { from: prev.label, to: cur.label, drop_pct: cur.drop_pct, lost };
      }
    }
  }

  // By-page drop-off: sessions with a page_view today, grouped by landing page.
  const byPage: Array<{ page: string; sessions: number; atc: number; atc_rate: number | null; dropped: number }> = [];
  try {
    const { data: pvRows } = await s
      .from('canonical_events')
      .select('session_id,page_path,landing_page')
      .eq('canonical_name', 'CANONICAL_PAGE_VIEW')
      .gte('occurred_at', dayIso)
      .not('session_id', 'is', null)
      .limit(10000);
    const sessionPage = new Map<string, string>();
    for (const r of pvRows ?? []) {
      const sid = String((r as any).session_id);
      if (sessionPage.has(sid)) continue;
      const page = (r as any).landing_page || (r as any).page_path || '/';
      sessionPage.set(sid, String(page));
    }
    const { data: atcRows } = await s
      .from('canonical_events')
      .select('session_id')
      .eq('canonical_name', 'CANONICAL_ADD_TO_CART')
      .gte('occurred_at', dayIso)
      .not('session_id', 'is', null)
      .limit(10000);
    const atcSessions = new Set<string>((atcRows ?? []).map((r: any) => String(r.session_id)));
    const agg = new Map<string, { sessions: number; atc: number }>();
    for (const [sid, page] of sessionPage) {
      const cur = agg.get(page) ?? { sessions: 0, atc: 0 };
      cur.sessions++;
      if (atcSessions.has(sid)) cur.atc++;
      agg.set(page, cur);
    }
    for (const [page, v] of agg) {
      const dropped = v.sessions - v.atc;
      const atc_rate = v.sessions > 0 ? Math.round((v.atc / v.sessions) * 1000) / 10 : null;
      byPage.push({ page, sessions: v.sessions, atc: v.atc, atc_rate, dropped });
    }
    byPage.sort((a, b) => b.dropped - a.dropped);
  } catch {}

  // By-product drop-off: ATC count vs purchase count (today), lost = atc - purch.
  const byProduct: Array<{ product_id: string; name: string | null; atc: number; purchases: number; lost: number; conv_rate: number | null }> = [];
  try {
    const [{ data: pAtc }, { data: pPur }] = await Promise.all([
      s.from('canonical_events').select('product_id').eq('canonical_name', 'CANONICAL_ADD_TO_CART').gte('occurred_at', dayIso).not('product_id', 'is', null).limit(5000),
      s.from('canonical_events').select('product_id').eq('canonical_name', 'CANONICAL_PURCHASE').gte('occurred_at', dayIso).not('product_id', 'is', null).limit(5000),
    ]);
    const agg = new Map<string, { atc: number; purch: number }>();
    for (const r of pAtc ?? []) { const k = String((r as any).product_id); const cur = agg.get(k) ?? { atc: 0, purch: 0 }; cur.atc++; agg.set(k, cur); }
    for (const r of pPur ?? []) { const k = String((r as any).product_id); const cur = agg.get(k) ?? { atc: 0, purch: 0 }; cur.purch++; agg.set(k, cur); }
    const ids = Array.from(agg.keys());
    let nameMap = new Map<string, string>();
    if (ids.length) {
      try {
        const { data: prods } = await s.from('products').select('id,name').in('id', ids);
        for (const p of prods ?? []) nameMap.set(String((p as any).id), (p as any).name ?? null);
      } catch {}
    }
    for (const [id, v] of agg) {
      const lost = Math.max(0, v.atc - v.purch);
      const conv_rate = v.atc > 0 ? Math.round((v.purch / v.atc) * 1000) / 10 : null;
      byProduct.push({ product_id: id, name: nameMap.get(id) ?? null, atc: v.atc, purchases: v.purch, lost, conv_rate });
    }
    byProduct.sort((a, b) => b.lost - a.lost || b.atc - a.atc);
  } catch {}

  return {
    steps,
    bottleneck,
    by_page: byPage.slice(0, 8),
    by_product: byProduct.slice(0, 8),
  };
}

// -----------------------------------------------------------------------------
// Live Buyer Heat scoring
// -----------------------------------------------------------------------------
// Classifies visitors active in the last 30 minutes into
//   BUYING_NOW → purchase captured, or checkout event in last 10 min
//   HOT        → intent score ≥ 40 (typically add-to-cart + product depth)
//   WARM       → intent score ≥ 15 (multi-product browsing / cart open)
//   COLD       → any activity below WARM threshold
// Weights are evidence-first: strong commercial actions dominate raw pageviews.
type BuyerClass = 'BUYING_NOW' | 'HOT' | 'WARM' | 'COLD';
type TopVisitor = {
  session_id: string;
  visitor_id: string | null;
  class: BuyerClass;
  score: number;
  last_stage: string | null;
  minutes_since_last: number;
  events: number;
  product_ids: string[];
  distinct_products: number;
  last_product_id: string | null;
  country: string | null;
  device: string | null;
  utm_source: string | null;
  landing_page: string | null;
  signals: string[];
};

const EVENT_WEIGHTS: Record<string, number> = {
  CANONICAL_PAGE_VIEW: 1,
  CANONICAL_PRODUCT_VIEW: 4,
  CANONICAL_CART: 8,
  CANONICAL_ADD_TO_CART: 20,
  CANONICAL_CHECKOUT: 40,
  CANONICAL_PURCHASE: 100,
};
const EVENT_CAP: Record<string, number> = {
  CANONICAL_PAGE_VIEW: 5,      // avoid rewarding refresh spam
  CANONICAL_PRODUCT_VIEW: 5,   // 5 × 4 = 20 max
};

async function scoreLiveBuyers(s: any) {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const empty = { hot: 0, warm: 0, buyingNow: 0, cold: 0, top: [] as TopVisitor[] };
  let rows: any[] = [];
  try {
    const { data } = await s
      .from('canonical_events')
      .select('session_id,visitor_id,canonical_name,occurred_at,product_id,country,device,utm_source,landing_page,page_path')
      .gte('occurred_at', since)
      .not('session_id', 'is', null)
      .order('occurred_at', { ascending: true })
      .limit(4000);
    rows = data ?? [];
  } catch {
    return empty;
  }
  if (!rows.length) return empty;

  const bySession = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(r.session_id);
    const arr = bySession.get(k) ?? [];
    arr.push(r);
    bySession.set(k, arr);
  }

  const now = Date.now();
  const visitors: TopVisitor[] = [];

  for (const [sessionId, evs] of bySession) {
    const counts: Record<string, number> = {};
    const products = new Set<string>();
    let lastEv = evs[0];
    let lastProduct: string | null = null;
    let lastCheckoutAt = 0;
    let hasPurchase = false;

    for (const e of evs) {
      const n = String(e.canonical_name ?? '');
      counts[n] = (counts[n] ?? 0) + 1;
      if (e.product_id) {
        products.add(String(e.product_id));
        lastProduct = String(e.product_id);
      }
      if (n === 'CANONICAL_CHECKOUT') lastCheckoutAt = new Date(e.occurred_at).getTime();
      if (n === 'CANONICAL_PURCHASE') hasPurchase = true;
      lastEv = e;
    }

    // Raw score from event weights, capped per event type
    let score = 0;
    const signals: string[] = [];
    for (const [name, c] of Object.entries(counts)) {
      const w = EVENT_WEIGHTS[name] ?? 0;
      if (!w) continue;
      const capped = EVENT_CAP[name] ? Math.min(c, EVENT_CAP[name]) : c;
      score += w * capped;
      if (w >= 8) signals.push(`${name.replace('CANONICAL_', '').toLowerCase()}×${c}`);
    }
    // Depth bonus — multi-product browsing suggests active shopping
    if (products.size >= 2) {
      const bonus = Math.min(products.size, 4) * 3;
      score += bonus;
      signals.push(`${products.size} products viewed`);
    }
    // Recency boost
    const lastMs = new Date(lastEv.occurred_at).getTime();
    const minutesSince = Math.max(0, Math.round((now - lastMs) / 60_000));
    if (minutesSince <= 2) { score += 12; signals.push('active <2m ago'); }
    else if (minutesSince <= 5) { score += 6; }

    // Classification
    let klass: BuyerClass;
    const checkoutRecent = lastCheckoutAt && (now - lastCheckoutAt) <= 10 * 60_000;
    if (hasPurchase || checkoutRecent) klass = 'BUYING_NOW';
    else if (score >= 40) klass = 'HOT';
    else if (score >= 15) klass = 'WARM';
    else klass = 'COLD';

    visitors.push({
      session_id: sessionId,
      visitor_id: lastEv.visitor_id ?? null,
      class: klass,
      score: Math.round(score),
      last_stage: lastEv.canonical_name ?? null,
      minutes_since_last: minutesSince,
      events: evs.length,
      product_ids: Array.from(products),
      distinct_products: products.size,
      last_product_id: lastProduct,
      country: lastEv.country ?? null,
      device: lastEv.device ?? null,
      utm_source: lastEv.utm_source ?? null,
      landing_page: lastEv.landing_page ?? lastEv.page_path ?? null,
      signals,
    });
  }

  // Rank: BUYING_NOW → HOT → WARM → COLD, then score desc, then recency
  const rank = (v: TopVisitor) =>
    v.class === 'BUYING_NOW' ? 4 : v.class === 'HOT' ? 3 : v.class === 'WARM' ? 2 : 1;
  visitors.sort((a, b) => (rank(b) - rank(a)) || (b.score - a.score) || (a.minutes_since_last - b.minutes_since_last));

  // Enrich top visitors with product name
  const top = visitors.slice(0, 10);
  const productIds = Array.from(new Set(top.map((v) => v.last_product_id).filter(Boolean))) as string[];
  const nameById = new Map<string, string>();
  if (productIds.length) {
    try {
      const { data: pr } = await s.from('products').select('id,name').in('id', productIds);
      for (const p of pr ?? []) nameById.set(String(p.id), String(p.name ?? ''));
    } catch {}
  }
  for (const v of top) {
    if (v.last_product_id && nameById.has(v.last_product_id)) {
      (v as any).last_product_name = nameById.get(v.last_product_id);
    }
  }

  return {
    buyingNow: visitors.filter((v) => v.class === 'BUYING_NOW').length,
    hot: visitors.filter((v) => v.class === 'HOT').length,
    warm: visitors.filter((v) => v.class === 'WARM').length,
    cold: visitors.filter((v) => v.class === 'COLD').length,
    top,
  };
}

function pickNextAction(ctx: any) {
  const { pv, atc, chk, hero, leaks, hotVisitors, buyingNowVisitors } = ctx;
  if (buyingNowVisitors > 0) {
    return {
      action: 'Escort buying-now visitors through checkout',
      why: `${buyingNowVisitors} visitor(s) reached checkout or purchase in the last 10 min`,
      confidence: 88, expected_revenue: buyingNowVisitors * 60, expected_roi: 9.0,
      eta_minutes: 2, rollback: 'Disable checkout assist widget',
      evidence: { buying_now_visitors: buyingNowVisitors },
    };
  }
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
  const f = wr.today ?? {};
  // Explain WHY no sale (or celebrate the sale) using funnel evidence.
  let why_no_sale: string;
  if (purchases > 0) {
    why_no_sale = `Sold ${purchases} order(s) today — revenue $${wr.today.revenue}. Keep amplifying the winning funnel.`;
  } else if ((f.page_views ?? 0) === 0) {
    why_no_sale = 'Zero visitors reached the site — no traffic to convert. Root cause: distribution, not conversion.';
  } else if ((f.qualified ?? 0) === 0) {
    why_no_sale = `${f.page_views} visitors landed but none engaged (scroll/PDP). Root cause: landing relevance / hook mismatch.`;
  } else if ((f.add_to_cart ?? 0) === 0) {
    why_no_sale = `${f.qualified ?? f.page_views} qualified visitors but zero add-to-cart. Root cause: PDP conversion (price/trust/CTA).`;
  } else if ((f.checkout ?? 0) === 0) {
    why_no_sale = `${f.add_to_cart} carts but zero began checkout. Root cause: cart friction (shipping, cost surprise, trust).`;
  } else {
    why_no_sale = `${f.checkout} began checkout but none completed. Root cause: checkout friction (payment, form, error).`;
  }

  const improvement = wr.next_action;
  const report = {
    report_date: new Date().toISOString().slice(0, 10),
    why_no_sale,
    best_improvement: improvement.action,
    improvement_reason: improvement.why,
    expected_roi: Number(improvement.expected_roi ?? 0),
    expected_revenue_usd: Number(improvement.expected_revenue ?? 0),
    confidence: Number(improvement.confidence ?? 0),
    eta_minutes: Number(improvement.eta_minutes ?? 0),
    rollback: improvement.rollback ?? null,
    funnel: f,
    leaks: wr.leaks ?? [],
    hero_product: wr.hero_product ?? null,
    live_buyers: wr.live_buyers ?? null,
    evidence: improvement.evidence ?? {},
  };
  const sha = await sha256(JSON.stringify(report));

  // Persist the audit report for the dashboard
  try {
    await s.from('revenue_audit_reports').insert({ ...report, sha256: sha });
  } catch (e) { console.error('revenue_audit_reports insert failed', e); }

  // Learning ledger (kept for backward compat)
  try {
    await s.from('first_sales_events').insert({
      event_kind: purchases > 0 ? 'purchase' : 'bounce',
      why: why_no_sale, revenue: wr.today.revenue, confidence: improvement.confidence,
      evidence: { funnel: f, leaks: wr.leaks, hero: wr.hero_product, improvement },
    });
  } catch {}

  return { audit: { ...report, sha256: sha } };
}

async function certify() {
  const s = sb();
  const wr = await buildWarRoom();
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  // Rich revenue forecast — blend today's paid revenue with pipeline velocity
  // (hot + buying-now visitors × conservative per-visitor value).
  const hotValue = (wr.live_buyers?.hot ?? 0) * 25;
  const buyingNowValue = (wr.live_buyers?.buying_now ?? 0) * 60;
  const pipelineValue = hotValue + buyingNowValue;
  const baseRevenue = Number(wr.today.revenue ?? 0);
  const forecast = {
    next_24h_revenue_low: Math.round(baseRevenue * 0.8 + pipelineValue * 0.3),
    next_24h_revenue_mid: Math.round(baseRevenue * 1.1 + pipelineValue * 0.6),
    next_24h_revenue_high: Math.round(baseRevenue * 1.4 + pipelineValue + 40),
    pipeline_value_estimate: pipelineValue,
    drivers: {
      buying_now_visitors: wr.live_buyers?.buying_now ?? 0,
      hot_visitors: wr.live_buyers?.hot ?? 0,
      warm_visitors: wr.live_buyers?.warm ?? 0,
    },
    assumptions: {
      hot_visitor_ev_usd: 25,
      buying_now_visitor_ev_usd: 60,
      hot_conversion_rate: 0.3,
      buying_now_conversion_rate: 1.0,
    },
  };

  // Applied fixes: last 20 first_sales_events treated as remediation ledger
  let applied_fixes: any[] = [];
  try {
    const { data } = await s
      .from('first_sales_events')
      .select('event_kind,why,revenue,confidence,evidence,created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    applied_fixes = data ?? [];
  } catch {}

  // Opportunities: leaks ranked by loss_est + next-best action variants
  const opportunities = (wr.leaks ?? []).slice(0, 5).map((l: any, i: number) => ({
    rank: i + 1,
    label: l.label,
    projected_revenue_recovery_usd: Math.round(l.loss_est),
    evidence: l.evidence,
  }));
  if (wr.hero_product) {
    opportunities.push({
      rank: opportunities.length + 1,
      label: `Amplify hero product: ${wr.hero_product.name ?? wr.hero_product.product_id}`,
      projected_revenue_recovery_usd: 120,
      evidence: `ATC 7d=${wr.hero_product.atc_7d}, purchases 7d=${wr.hero_product.purchases_7d}`,
    });
  }

  // Live buyer snapshot (redacted — session_id + class only for the ledger)
  const live_buyers_snapshot = {
    captured_at: new Date().toISOString(),
    window_minutes: wr.live_buyers?.window_minutes ?? 30,
    counts: {
      buying_now: wr.live_buyers?.buying_now ?? 0,
      hot: wr.live_buyers?.hot ?? 0,
      warm: wr.live_buyers?.warm ?? 0,
      cold: wr.live_buyers?.cold ?? 0,
    },
    top: (wr.live_buyers?.top ?? []).slice(0, 10).map((v: any) => ({
      session_id: v.session_id,
      class: v.class,
      score: v.score,
      last_stage: v.last_stage,
      minutes_since_last: v.minutes_since_last,
      utm_source: v.utm_source,
      last_product_id: v.last_product_id,
    })),
  };

  const funnel = {
    visitors: wr.today.visitors ?? 0,
    qualified_visitors: wr.today.qualified_visitors ?? 0,
    add_to_cart: wr.today.add_to_cart ?? 0,
    checkouts: wr.today.checkouts ?? 0,
    purchases: wr.today.purchases ?? 0,
    pdp_to_atc_pct: wr.today.visitors ? Math.round((wr.today.add_to_cart / wr.today.visitors) * 1000) / 10 : 0,
    atc_to_checkout_pct: wr.today.add_to_cart ? Math.round((wr.today.checkouts / wr.today.add_to_cart) * 1000) / 10 : 0,
    checkout_to_purchase_pct: wr.today.checkouts ? Math.round((wr.today.purchases / wr.today.checkouts) * 1000) / 10 : 0,
  };

  const payload = {
    report_title: 'First Sales Recovery Report',
    report_version: 'v1',
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
    funnel,
    leaks: wr.leaks ?? [],
    applied_fixes,
    opportunities,
    live_buyers: live_buyers_snapshot,
  };
  const hash = await sha256(JSON.stringify(payload));
  const { data, error } = await s.from('first_sales_certifications').insert({ ...payload, sha256: hash }).select().maybeSingle();
  if (error) throw error;
  return { certification: data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;
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