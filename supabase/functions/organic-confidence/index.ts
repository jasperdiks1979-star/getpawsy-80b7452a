// Organic Confidence — computes the primary executive KPI of the Revenue
// Operating System. Reads Layer 1 (Organic Truth) from visitor_activity +
// orders, never consumes paid features. Returns global / per-product /
// per-category / per-pin confidence with pyramid classification.
//
// READ-ONLY. No table mutations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PAID_MEDIUMS = new Set([
  "cpc","ppc","paid","paidsearch","paid_search","paid_social",
  "display","retargeting","remarketing","affiliate","influencer","shopping",
]);
const PAID_CAMPAIGN_PREFIXES = ["ads_","paid_","promo_","ppc_","retarget_","shop_"];

const isPaid = (r: { utm_source?: string|null; utm_medium?: string|null; utm_campaign?: string|null }) => {
  const med = (r.utm_medium ?? "").toLowerCase();
  const src = (r.utm_source ?? "").toLowerCase();
  const cmp = (r.utm_campaign ?? "").toLowerCase();
  if (PAID_MEDIUMS.has(med)) return true;
  if (src === "ads" || src === "paid" || src.endsWith("_ads")) return true;
  if (PAID_CAMPAIGN_PREFIXES.some(p => cmp.startsWith(p))) return true;
  return false;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const log01 = (n: number, ceil: number) => clamp01(Math.log1p(Math.max(0, n)) / Math.log1p(ceil));

const WEIGHTS = {
  organic_visitors: 0.15,
  organic_engagement: 0.20,
  organic_conversion: 0.25,
  organic_revenue: 0.15,
  returning_quality: 0.10,
  paid_independence: 0.15,
};

function score(input: {
  organic_visitors: number; organic_product_views: number; organic_add_to_cart: number;
  organic_purchases: number; organic_revenue: number; organic_returning_sessions: number;
  paid_visitors: number;
}) {
  const total = input.organic_visitors + input.paid_visitors;
  const paid_share = total > 0 ? input.paid_visitors / total : 0;
  const view_rate = input.organic_visitors > 0 ? clamp01(input.organic_product_views / input.organic_visitors) : 0;
  const atc_rate  = input.organic_product_views > 0 ? clamp01(input.organic_add_to_cart / input.organic_product_views) : 0;
  const cvr       = input.organic_product_views > 0 ? clamp01(input.organic_purchases / input.organic_product_views) : 0;
  const c = {
    organic_visitors: log01(input.organic_visitors, 1000),
    organic_engagement: 0.5 * view_rate + 0.5 * Math.min(1, atc_rate * 8),
    organic_conversion: Math.min(1, cvr * 25),
    organic_revenue: log01(input.organic_revenue, 5000),
    returning_quality: log01(input.organic_returning_sessions, 200),
    paid_independence: clamp01(1 - paid_share),
  };
  let s = 0;
  for (const [k,w] of Object.entries(WEIGHTS)) s += (c as any)[k] * w * 100;
  let level = "hypothesis", level_index = 1;
  if (input.organic_visitors >= 10 && s >= 20) { level = "emerging"; level_index = 2; }
  if (input.organic_visitors >= 50 && s >= 45 && (input.organic_purchases >= 1 || atc_rate >= 0.05)) {
    level = "validated"; level_index = 3;
  }
  if (input.organic_purchases >= 2 && s >= 65) { level = "organic_winner"; level_index = 4; }
  if (input.organic_purchases >= 3 && cvr >= 0.02 && s >= 80 && paid_share <= 0.5) {
    level = "scale_candidate"; level_index = 5;
  }
  return { score: Math.round(s*100)/100, level, level_index, paid_share, organic_conversion_rate: cvr, components: c };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function authorize(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  if (auth === `Bearer ${SERVICE_ROLE}`) return { sb, mode: "service" as const };
  if (!auth.startsWith("Bearer ")) return null;
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return null;
  const { data: role } = await sb.from("user_roles").select("role")
    .eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return role ? { sb, mode: "admin" as const } : null;
}

type Bucket = {
  visitors: number; sessions: Set<string>; product_views: number;
  add_to_cart: number; checkout: number; purchases: number; revenue: number;
  returning_sessions: number;
};
const empty = (): Bucket => ({
  visitors: 0, sessions: new Set(), product_views: 0,
  add_to_cart: 0, checkout: 0, purchases: 0, revenue: 0, returning_sessions: 0,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ok = await authorize(req);
    if (!ok) return json({ error: "unauthorized" }, 401);
    const { sb } = ok;
    const url = new URL(req.url);
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const { data: rows, error } = await sb.from("visitor_activity")
      .select("session_id,activity_type,utm_source,utm_medium,utm_campaign,product_id,product_category,product_name,order_value,created_at")
      .gte("created_at", since)
      .eq("is_internal", false)
      .eq("is_bot_suspect", false)
      .limit(200_000);
    if (error) throw error;

    const global = { organic: empty(), paid: empty() };
    const perProduct = new Map<string, { name: string; cat: string; organic: Bucket; paid: Bucket }>();
    const perCategory = new Map<string, { organic: Bucket; paid: Bucket }>();
    const sessionVisits = new Map<string, number>();

    for (const r of rows ?? []) {
      if (r.session_id) sessionVisits.set(r.session_id, (sessionVisits.get(r.session_id) ?? 0) + 1);
    }

    for (const r of rows ?? []) {
      const paid = isPaid(r);
      const layer = paid ? "paid" : "organic";
      const b = (global as any)[layer] as Bucket;
      if (r.session_id) b.sessions.add(r.session_id);
      b.visitors += 1;
      const val = Number(r.order_value ?? 0);
      switch (r.activity_type) {
        case "product_view": b.product_views += 1; break;
        case "add_to_cart":  b.add_to_cart   += 1; break;
        case "checkout":     b.checkout      += 1; break;
        case "purchase":     b.purchases     += 1; b.revenue += val; break;
      }

      const pid = r.product_id ? String(r.product_id) : null;
      if (pid) {
        if (!perProduct.has(pid)) perProduct.set(pid, {
          name: r.product_name ?? pid, cat: r.product_category ?? "uncategorised",
          organic: empty(), paid: empty(),
        });
        const p = perProduct.get(pid)!;
        const pb = (p as any)[layer] as Bucket;
        if (r.session_id) pb.sessions.add(r.session_id);
        pb.visitors += 1;
        switch (r.activity_type) {
          case "product_view": pb.product_views += 1; break;
          case "add_to_cart":  pb.add_to_cart   += 1; break;
          case "checkout":     pb.checkout      += 1; break;
          case "purchase":     pb.purchases     += 1; pb.revenue += val; break;
        }
      }
      const cat = r.product_category ?? null;
      if (cat) {
        if (!perCategory.has(cat)) perCategory.set(cat, { organic: empty(), paid: empty() });
        const c = perCategory.get(cat)!;
        const cb = (c as any)[layer] as Bucket;
        if (r.session_id) cb.sessions.add(r.session_id);
        cb.visitors += 1;
        switch (r.activity_type) {
          case "product_view": cb.product_views += 1; break;
          case "add_to_cart":  cb.add_to_cart   += 1; break;
          case "purchase":     cb.purchases     += 1; cb.revenue += val; break;
        }
      }
    }

    const finalize = (b: Bucket) => {
      let returning = 0;
      for (const sid of b.sessions) if ((sessionVisits.get(sid) ?? 0) >= 2) returning += 1;
      b.returning_sessions = returning;
    };
    finalize(global.organic); finalize(global.paid);
    for (const v of perProduct.values()) { finalize(v.organic); finalize(v.paid); }
    for (const v of perCategory.values()) { finalize(v.organic); finalize(v.paid); }

    const inputFor = (o: Bucket, p: Bucket) => ({
      organic_visitors: o.visitors, organic_product_views: o.product_views,
      organic_add_to_cart: o.add_to_cart, organic_purchases: o.purchases,
      organic_revenue: o.revenue, organic_returning_sessions: o.returning_sessions,
      paid_visitors: p.visitors,
    });

    const globalScore = score(inputFor(global.organic, global.paid));

    const products = [...perProduct.entries()].map(([id, v]) => {
      const sc = score(inputFor(v.organic, v.paid));
      return {
        product_id: id, product_name: v.name, category: v.cat,
        organic_revenue: v.organic.revenue,
        organic_visitors: v.organic.visitors,
        organic_purchases: v.organic.purchases,
        organic_conversion: sc.organic_conversion_rate,
        paid_share: sc.paid_share,
        confidence: sc.score, level: sc.level, level_index: sc.level_index,
      };
    }).sort((a, b) => b.confidence - a.confidence);

    const categories = [...perCategory.entries()].map(([cat, v]) => {
      const sc = score(inputFor(v.organic, v.paid));
      return {
        category: cat,
        organic_visitors: v.organic.visitors,
        organic_revenue: v.organic.revenue,
        organic_purchases: v.organic.purchases,
        paid_share: sc.paid_share,
        confidence: sc.score, level: sc.level, level_index: sc.level_index,
      };
    }).sort((a, b) => b.confidence - a.confidence);

    // Pinterest pin-level confidence — best effort from existing snapshots.
    let pins: any[] = [];
    try {
      const { data: pinRows } = await sb.from("pinterest_pin_performance")
        .select("pin_id,product_id,saves,clicks,impressions,outbound_clicks,revenue,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      pins = (pinRows ?? []).map((p: any) => {
        const saves = Number(p.saves ?? 0);
        const clicks = Number(p.outbound_clicks ?? p.clicks ?? 0);
        const imps = Number(p.impressions ?? 0);
        const ctr = imps > 0 ? clicks / imps : 0;
        const save_rate = imps > 0 ? saves / imps : 0;
        const conf = Math.round(Math.min(100,
          50 * Math.min(1, ctr * 200) + 30 * Math.min(1, save_rate * 100) +
          20 * log01(Number(p.revenue ?? 0), 1000)) * 100) / 100;
        const level = conf >= 80 ? "scale_candidate" : conf >= 65 ? "organic_winner" :
                      conf >= 45 ? "validated" : conf >= 20 ? "emerging" : "hypothesis";
        return {
          pin_id: p.pin_id, product_id: p.product_id,
          impressions: imps, saves, clicks, revenue: Number(p.revenue ?? 0),
          ctr, save_rate, confidence: conf, level,
        };
      }).sort((a, b) => b.confidence - a.confidence);
    } catch { /* table optional */ }

    return json({
      ok: true,
      generated_at: new Date().toISOString(),
      window_days: days,
      principle: "ORGANIC-FIRST — paid traffic is never used as proof of product quality.",
      weights: WEIGHTS,
      global: {
        organic: {
          visitors: global.organic.visitors, sessions: global.organic.sessions.size,
          product_views: global.organic.product_views, add_to_cart: global.organic.add_to_cart,
          checkout: global.organic.checkout, purchases: global.organic.purchases,
          revenue: global.organic.revenue, returning_sessions: global.organic.returning_sessions,
          conversion_rate: global.organic.visitors ? global.organic.purchases / global.organic.visitors : 0,
          revenue_per_visitor: global.organic.visitors ? global.organic.revenue / global.organic.visitors : 0,
        },
        paid: {
          visitors: global.paid.visitors, sessions: global.paid.sessions.size,
          revenue: global.paid.revenue, purchases: global.paid.purchases,
        },
        confidence: globalScore,
      },
      products: products.slice(0, 200),
      categories,
      pins: pins.slice(0, 100),
      counts: { products: products.length, categories: categories.length, pins: pins.length },
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
