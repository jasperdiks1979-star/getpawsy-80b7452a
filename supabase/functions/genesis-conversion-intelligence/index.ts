import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);

function scoreImages(p: any) {
  const imgs: string[] = Array.isArray(p.images) ? p.images : [];
  const count = imgs.length + (p.image_url ? 1 : 0);
  let s = 0;
  s += Math.min(40, count * 10);
  if (p.image_url) s += 15;
  if (count >= 4) s += 15;
  if (count >= 6) s += 10;
  if (p.image_alt_text) s += 10;
  if (imgs.some((u) => /1500|1600|2000|hi|large/i.test(String(u)))) s += 10;
  return clamp(s);
}

function scoreCopy(p: any) {
  let s = 0;
  if ((p.seo_title || p.optimized_title || p.shopping_title)) s += 15;
  const desc = String(p.optimized_description || p.description || "");
  if (desc.length > 200) s += 20;
  if (desc.length > 600) s += 10;
  const bullets = Array.isArray(p.description_bullets) ? p.description_bullets.length : 0;
  s += Math.min(20, bullets * 5);
  if (p.seo_meta_description || p.meta_description) s += 10;
  if (p.benefit_angle) s += 10;
  if (p.conversion_angle) s += 10;
  if (p.key_feature) s += 5;
  return clamp(s);
}

function scoreTrust(p: any, reviewCount: number, avgRating: number) {
  let s = 30; // baseline policies (returns / secure checkout / guarantee already on site)
  if (reviewCount >= 1) s += 15;
  if (reviewCount >= 5) s += 15;
  if (avgRating >= 4.0) s += 15;
  if (p.shipping_time) s += 10;
  if (p.brand) s += 5;
  if (p.supplier_warehouse === "US" || p.stock_source === "us") s += 10;
  return clamp(s);
}

function scoreMobile(p: any) {
  // Proxy: short titles + bullets render better on iPhone, hero present, reasonable image count
  let s = 50;
  const title = String(p.short_title || p.seo_title || p.name || "");
  if (title.length > 0 && title.length <= 60) s += 15;
  if (Array.isArray(p.description_bullets) && p.description_bullets.length >= 3) s += 15;
  if (p.image_url) s += 10;
  if ((p.optimized_description || p.description || "").length > 4000) s -= 10; // wall of text
  return clamp(s);
}

function scoreSignals(funnel: any, fsps: number, recScore: number) {
  let s = fsps * 0.5 + recScore * 0.3;
  s += Math.min(20, num(funnel?.atc) * 4 + num(funnel?.checkout) * 6 + num(funnel?.purchase) * 10);
  return clamp(s);
}

function detectFrictions(p: any, sub: any) {
  const f: string[] = [];
  if (sub.image < 60) f.push("weak_or_missing_lifestyle_imagery");
  if ((Array.isArray(p.images) ? p.images.length : 0) < 3) f.push("too_few_product_images");
  if (!p.seo_title && !p.optimized_title) f.push("missing_optimized_headline");
  if (!(Array.isArray(p.description_bullets) && p.description_bullets.length >= 3)) f.push("missing_benefit_bullets");
  if (!p.benefit_angle) f.push("missing_benefit_angle");
  if (!p.conversion_angle) f.push("missing_conversion_hook");
  if (sub.trust < 55) f.push("weak_trust_signals_reviews");
  if (sub.mobile < 65) f.push("mobile_layout_or_title_length");
  if (!p.seo_meta_description) f.push("missing_meta_description");
  if (Number(p.price) > 80 && !p.compare_at_price) f.push("no_price_anchor_for_premium_price");
  return f;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const startedAt = new Date().toISOString();
  const { data: run } = await supa.from("gci_runs").insert({ started_at: startedAt }).select().single();

  // Pull active in-stock products
  const { data: products, error: pErr } = await supa
    .from("products")
    .select("id,slug,name,price,compare_at_price,image_url,images,image_alt_text,description,optimized_description,description_bullets,seo_title,optimized_title,shopping_title,short_title,seo_meta_description,meta_description,benefit_angle,conversion_angle,key_feature,brand,shipping_time,supplier_warehouse,stock_source,stock,is_active")
    .eq("is_active", true)
    .gt("stock", 0)
    .limit(2000);
  if (pErr) return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Aux signals
  const { data: fsps } = await supa.from("gv6_first_sale_scores").select("product_id,fsps");
  const fspsMap = new Map<string, number>((fsps ?? []).map((r: any) => [r.product_id, num(r.fsps)]));

  const { data: opp } = await supa.from("pinterest_revenue_opportunity_scores").select("product_id,total_score").limit(2000);
  const oppMap = new Map<string, number>((opp ?? []).map((r: any) => [r.product_id, num(r.total_score)]));

  const { data: reviews } = await supa.from("product_reviews").select("product_id,rating");
  const reviewAgg = new Map<string, { count: number; avg: number }>();
  for (const r of reviews ?? []) {
    const cur = reviewAgg.get((r as any).product_id) ?? { count: 0, avg: 0 };
    cur.count += 1;
    cur.avg = ((cur.avg * (cur.count - 1)) + num((r as any).rating)) / cur.count;
    reviewAgg.set((r as any).product_id, cur);
  }

  const rows: any[] = [];
  let totalLift = 0;
  let crsSum = 0;
  let trustSum = 0;

  for (const p of products ?? []) {
    const sub = {
      image: scoreImages(p),
      copy: scoreCopy(p),
      trust: scoreTrust(p, reviewAgg.get(p.id)?.count ?? 0, reviewAgg.get(p.id)?.avg ?? 0),
      mobile: scoreMobile(p),
      signal: scoreSignals({}, fspsMap.get(p.id) ?? 0, oppMap.get(p.id) ?? 0),
    };
    const crs = clamp(
      sub.image * 0.22 +
      sub.copy * 0.22 +
      sub.trust * 0.18 +
      sub.mobile * 0.18 +
      sub.signal * 0.20
    );
    const fspsV = fspsMap.get(p.id) ?? 0;
    const margin = Math.max(0, Number(p.price ?? 0) - Number((p as any).cost_price ?? 0));
    const conv_lift = clamp(((100 - crs) / 100) * 0.12 * 100, 0, 12); // pct points
    const revenue_lift = (oppMap.get(p.id) ?? 0) * (conv_lift / 100) * Math.max(5, margin || Number(p.price ?? 0) * 0.3);
    totalLift += revenue_lift;
    crsSum += crs;
    trustSum += sub.trust;
    const frictions = detectFrictions(p, sub);

    rows.push({
      product_id: p.id,
      product_slug: p.slug,
      product_name: p.name,
      crs: Math.round(crs * 100) / 100,
      trust_score: Math.round(sub.trust * 100) / 100,
      mobile_score: Math.round(sub.mobile * 100) / 100,
      image_score: Math.round(sub.image * 100) / 100,
      copy_score: Math.round(sub.copy * 100) / 100,
      signal_score: Math.round(sub.signal * 100) / 100,
      expected_revenue_lift: Math.round(revenue_lift * 100) / 100,
      expected_conv_lift: Math.round(conv_lift * 100) / 100,
      frictions,
      components: { sub, fsps: fspsV, opportunity: oppMap.get(p.id) ?? 0, margin },
      confidence: clamp(40 + (sub.signal * 0.4) + ((reviewAgg.get(p.id)?.count ?? 0) * 2), 0, 95),
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert in batches
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supa.from("gci_scores").upsert(slice, { onConflict: "product_id" });
    if (error) console.error("upsert", error.message);
  }

  // Reprioritize top revenue-lift products in pinterest_pin_queue (non-destructive: only raise drafts)
  const top = [...rows].sort((a, b) => b.expected_revenue_lift - a.expected_revenue_lift).slice(0, 25);
  let improved = 0;
  for (const r of top) {
    const { error, count } = await supa
      .from("pinterest_pin_queue")
      .update({ priority: 92 })
      .eq("product_id", r.product_id)
      .in("status", ["draft", "queued", "pending"]) as any;
    if (!error && (count ?? 0) > 0) improved++;
  }

  const avg_crs = rows.length ? crsSum / rows.length : 0;
  const avg_trust = rows.length ? trustSum / rows.length : 0;
  // Bayesian-ish ETA: lower CRS => more hours; floor at 24h
  const eta_hours = Math.max(24, Math.round(720 * Math.exp(-avg_crs / 35)));

  await supa.from("gci_runs").update({
    finished_at: new Date().toISOString(),
    products_analyzed: rows.length,
    products_improved: improved,
    avg_crs,
    avg_trust,
    total_expected_revenue_lift: totalLift,
    first_sale_eta_hours: eta_hours,
    summary: {
      top10: rows.sort((a, b) => b.crs - a.crs).slice(0, 10).map((r) => ({ id: r.product_id, name: r.product_name, crs: r.crs })),
    },
  }).eq("id", run!.id);

  return new Response(JSON.stringify({
    ok: true,
    run_id: run!.id,
    products_analyzed: rows.length,
    products_improved: improved,
    avg_crs,
    avg_trust,
    first_sale_eta_hours: eta_hours,
    total_expected_revenue_lift: totalLift,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});