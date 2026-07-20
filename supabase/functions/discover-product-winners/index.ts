import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Product = {
  id: string;
  name: string;
  name_clean: string | null;
  price: number;
  cost_price: number | null;
  stock: number | null;
  category: string | null;
  primary_species: string | null;
  pinterest_priority: string | null;
  pinterest_eligible: boolean | null;
  image_url: string | null;
  images: string[] | null;
  is_active: boolean | null;
};

type Perf = { product_id: string; pins: number; impressions: number; clicks: number };

function priceBand(p: number) {
  // impulse-buy sweet spot
  if (p >= 8 && p <= 30) return 22;
  if (p > 30 && p <= 60) return 14;
  if (p > 60 && p <= 100) return 7;
  if (p > 100) return 2;
  return 3;
}
function marginScore(price: number, cost: number | null) {
  if (!cost || cost <= 0) return 6; // unknown — neutral
  const m = (price - cost) / price;
  if (m >= 0.6) return 22;
  if (m >= 0.45) return 17;
  if (m >= 0.3) return 11;
  if (m >= 0.15) return 5;
  return 1;
}
function nameQuality(p: Product) {
  if (p.name_clean && p.name_clean.length >= 18 && p.name_clean.length <= 70) return 12;
  const n = p.name || "";
  if (n.length >= 20 && n.length <= 70 && !/[\u4e00-\u9fff]/.test(n)) return 7;
  return 1;
}
function hasImage(p: Product) {
  return p.image_url || (p.images && p.images.length > 0) ? 6 : 0;
}
function pinPriorityScore(p: Product) {
  const v = (p.pinterest_priority || "").toLowerCase();
  if (v === "high" || v === "featured" || v === "top") return 10;
  if (v === "normal") return 6;
  return 3;
}
function speciesScore(s: string | null) {
  return s === "dog" || s === "cat" ? 6 : 2;
}
function stockScore(s: number | null) {
  const n = s ?? 0;
  if (n >= 50) return 6;
  if (n >= 15) return 4;
  if (n >= 3) return 2;
  return 0;
}
function perfBoost(perf: Perf | undefined) {
  if (!perf) return 0;
  // log-scaled click signal, cap 16
  const clicks = perf.clicks || 0;
  if (clicks <= 0) return 0;
  return Math.min(16, Math.round(Math.log10(clicks + 1) * 11));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const runId = crypto.randomUUID();

  try {
    const { data: products, error } = await sb
      .from("products")
      .select("id,name,name_clean,price,cost_price,stock,category,primary_species,pinterest_priority,pinterest_eligible,image_url,images,is_active")
      .eq("is_active", true)
      .gt("stock", 0)
      .limit(2000);
    if (error) throw error;
    const list = (products ?? []) as Product[];

    const ids = list.map((p) => p.id);
    const { data: perfRows } = await sb
      .from("pinterest_pin_performance")
      .select("product_id,impressions,clicks")
      .in("product_id", ids);
    const perfMap = new Map<string, Perf>();
    for (const r of perfRows ?? []) {
      const cur = perfMap.get(r.product_id) ?? { product_id: r.product_id, pins: 0, impressions: 0, clicks: 0 };
      cur.pins += 1;
      cur.impressions += r.impressions ?? 0;
      cur.clicks += r.clicks ?? 0;
      perfMap.set(r.product_id, cur);
    }

    // Category density for competition level
    const catCount = new Map<string, number>();
    for (const p of list) {
      const c = (p.category || "uncategorized").toLowerCase();
      catCount.set(c, (catCount.get(c) ?? 0) + 1);
    }

    const rows = list.map((p) => {
      const price = Number(p.price) || 0;
      const cost = p.cost_price == null ? null : Number(p.cost_price);
      const perf = perfMap.get(p.id);

      const sPrice = priceBand(price);
      const sMargin = marginScore(price, cost);
      const sName = nameQuality(p);
      const sImg = hasImage(p);
      const sPin = pinPriorityScore(p);
      const sSpc = speciesScore(p.primary_species);
      const sStk = stockScore(p.stock);
      const sElig = p.pinterest_eligible ? 4 : 0;
      const sPerf = perfBoost(perf);

      const revenue = Math.min(100, sPrice + sMargin + sName + sImg + sPin + sSpc + sStk + sElig + sPerf);
      const pinClick = Math.min(100, Math.round((sName * 3 + sImg * 5 + sPin * 4 + sElig * 4 + sPerf * 2) * 0.9));
      const conversion = Math.min(100, Math.round((sPrice * 2 + sMargin * 2 + sName + sImg) * 1.05));
      const impulse = Math.min(100, Math.round((sPrice * 2.6 + sName + sImg + sStk) * 1.05));
      const perceived = Math.min(100, Math.round(sMargin * 2.2 + (price >= 35 ? 22 : 6) + sName + sImg + (p.name_clean ? 8 : 0)));
      const bestseller = Math.min(100, Math.round(revenue * 0.55 + sPerf * 2.4 + sPin * 1.5 + sStk * 1.2));
      const firstSale = Math.min(100, Math.round(impulse * 0.5 + conversion * 0.35 + pinClick * 0.15));

      const profit = cost == null ? Math.max(0, price * 0.45 - 4) : Math.max(0, price - cost - 4);
      const density = catCount.get((p.category || "uncategorized").toLowerCase()) ?? 0;
      const competition = density >= 60 ? "high" : density >= 25 ? "medium" : "low";

      const hasPins = (perf?.pins ?? 0) > 0;
      const stalled = perf && perf.impressions >= 80 && (perf.clicks ?? 0) === 0;

      let verdict: "scale" | "winner" | "needs_creative" | "pause" | "loser" | "hold" = "hold";
      if (stalled) verdict = "pause";
      else if (revenue >= 70 && hasPins && (perf!.clicks ?? 0) >= 3) verdict = "scale";
      else if (revenue >= 70) verdict = "winner";
      else if (revenue >= 55 && pinClick < 55) verdict = "needs_creative";
      else if (revenue < 32 || sImg === 0) verdict = "loser";

      return {
        product_id: p.id,
        run_id: runId,
        revenue_probability: revenue,
        pinterest_click_probability: pinClick,
        conversion_probability: conversion,
        impulse_score: impulse,
        perceived_value_score: perceived,
        bestseller_score: bestseller,
        first_sale_score: firstSale,
        estimated_profit_per_sale: Math.round(profit * 100) / 100,
        competition_level: competition,
        verdict,
        signals: {
          price, cost, margin_pct: cost ? Math.round(((price - cost) / price) * 100) : null,
          pins: perf?.pins ?? 0, impressions: perf?.impressions ?? 0, clicks: perf?.clicks ?? 0,
          name_clean: !!p.name_clean, category: p.category, species: p.primary_species,
          pinterest_priority: p.pinterest_priority, density,
        },
      };
    });

    // Insert in chunks
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: insErr } = await sb.from("product_winner_scores").insert(chunk);
      if (insErr) throw insErr;
    }

    // Build lists with product name for UI
    const byId = new Map(list.map((p) => [p.id, p]));
    const decorate = (r: typeof rows[number]) => ({
      ...r,
      name: byId.get(r.product_id)?.name_clean || byId.get(r.product_id)?.name || "(no name)",
      slug_id: r.product_id,
      price: Number(byId.get(r.product_id)?.price ?? 0),
      image: byId.get(r.product_id)?.image_url ?? null,
      category: byId.get(r.product_id)?.category ?? null,
    });
    const top = (k: keyof typeof rows[number], n = 10) =>
      [...rows].sort((a, b) => (Number(b[k]) || 0) - (Number(a[k]) || 0)).slice(0, n).map(decorate);

    const payload = {
      ok: true,
      run_id: runId,
      scored: rows.length,
      lists: {
        first_sales: top("first_sale_score"),
        bestsellers: top("bestseller_score"),
        pinterest_potential: top("pinterest_click_probability"),
        impulse_buy: top("impulse_score"),
        perceived_value: top("perceived_value_score"),
        winners: rows.filter((r) => r.verdict === "winner" || r.verdict === "scale").sort((a, b) => b.revenue_probability - a.revenue_probability).slice(0, 25).map(decorate),
        losers: rows.filter((r) => r.verdict === "loser").sort((a, b) => a.revenue_probability - b.revenue_probability).slice(0, 25).map(decorate),
        pause: rows.filter((r) => r.verdict === "pause").slice(0, 25).map(decorate),
        scale: rows.filter((r) => r.verdict === "scale").sort((a, b) => b.revenue_probability - a.revenue_probability).slice(0, 25).map(decorate),
        needs_creative: rows.filter((r) => r.verdict === "needs_creative").sort((a, b) => b.revenue_probability - a.revenue_probability).slice(0, 25).map(decorate),
      },
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});