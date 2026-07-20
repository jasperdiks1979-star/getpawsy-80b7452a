// Wave 3A+ — Pinterest Potential Scorer (0–100).
// Composite score of landing pass, intelligence confidence, margin, stock,
// category demand, and image quality. Writes to pin_product_intelligence
// and logs sub-70 products to pin_potential_audit so they are excluded from
// the creative pipeline.
//
// POST { action: "run", limit?: number }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

const MIN_GATE = 70;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

async function loadCategoryDemand(): Promise<Record<string, number>> {
  const { data } = await supa
    .from("pinterest_category_benchmarks")
    .select("category, avg_ctr, avg_save_rate");
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) {
    // Normalize to 0..100: weighted ctr + save.
    const s = clamp((Number(r.avg_ctr ?? 0) * 50) + (Number(r.avg_save_rate ?? 0) * 50));
    if (r.category) map[String(r.category).toLowerCase()] = s;
  }
  return map;
}

async function loadImageQuality(productIds: string[]): Promise<Record<string, number>> {
  if (!productIds.length) return {};
  const out: Record<string, number> = {};
  // Chunked IN query
  const chunk = 200;
  for (let i = 0; i < productIds.length; i += chunk) {
    const ids = productIds.slice(i, i + chunk);
    const { data } = await supa
      .from("cj_media_asset_registry")
      .select("product_id, width, height, status")
      .in("product_id", ids);
    for (const r of (data ?? []) as any[]) {
      const wh = Math.min(Number(r.width ?? 0), Number(r.height ?? 0));
      const ok = r.status === "ok" || r.status === "active" || r.status === null;
      const s = clamp((ok ? 60 : 30) + (wh >= 1200 ? 40 : wh >= 800 ? 25 : wh >= 500 ? 10 : 0));
      out[r.product_id] = Math.max(out[r.product_id] ?? 0, s);
    }
  }
  return out;
}

async function run(limit?: number) {
  const { data: intelAll, error: e1 } = await supa
    .from("pin_product_intelligence")
    .select("id, product_id, confidence, category");
  if (e1) throw e1;

  const intel = (intelAll ?? []) as any[];
  const limited = typeof limit === "number" ? intel.slice(0, limit) : intel;
  const productIds = limited.map((r) => r.product_id);

  // Fetch ALL in one shot (avoid huge .in() URLs); filter in memory.
  const [{ data: prodsAll }, { data: valsAll }, demand, imgq] = await Promise.all([
    supa.from("products").select("id, margin_percent, effective_stock, category").eq("is_active", true).limit(5000),
    supa.from("pin_landing_validations").select("product_id, passed, checks").limit(5000),
    loadCategoryDemand(),
    loadImageQuality(productIds),
  ]);
  const prods = prodsAll ?? [];
  const vals = valsAll ?? [];

  const pById = new Map((prods ?? []).map((p: any) => [p.id, p]));
  const vById = new Map((vals ?? []).map((v: any) => [v.product_id, v]));

  let scored = 0;
  let belowGate = 0;
  const histogram: Record<string, number> = { "0-29": 0, "30-49": 0, "50-69": 0, "70-84": 0, "85-100": 0 };

  for (const row of limited) {
    const p: any = pById.get(row.product_id) ?? {};
    const v: any = vById.get(row.product_id) ?? {};
    const landingPass = v.passed === true ? 100 : v.passed === false ? 40 : 60;
    const intelConf = clamp(Number(row.confidence ?? 0));
    const margin = clamp(Number(p.margin_percent ?? 0));
    const stock = clamp(Math.min(100, Number(p.effective_stock ?? 0) * 2)); // 50+ = 100
    const cat = String(row.category ?? p.category ?? "").toLowerCase();
    const catDemand = clamp(demand[cat] ?? 55);
    const imgQuality = clamp(imgq[row.product_id] ?? 60);

    // Weighted composite
    const potential = Math.round(
      landingPass * 0.20 +
      intelConf * 0.20 +
      margin * 0.20 +
      stock * 0.15 +
      catDemand * 0.15 +
      imgQuality * 0.10,
    );

    const breakdown = { landingPass, intelConf, margin, stock, catDemand, imgQuality };
    await supa.from("pin_product_intelligence")
      .update({ potential_score: potential, potential_breakdown: breakdown, potential_scored_at: new Date().toISOString() })
      .eq("id", row.id);

    if (potential < MIN_GATE) {
      belowGate++;
      const reasons: string[] = [];
      if (landingPass < 70) reasons.push("landing_failing");
      if (intelConf < 70) reasons.push("low_intelligence_confidence");
      if (margin < 25) reasons.push("low_margin");
      if (stock < 20) reasons.push("low_stock");
      if (catDemand < 50) reasons.push("weak_category_demand");
      if (imgQuality < 60) reasons.push("weak_image_quality");
      await supa.from("pin_potential_audit").insert({
        product_id: row.product_id,
        potential_score: potential,
        reasons,
      });
    }
    scored++;
    const bucket =
      potential < 30 ? "0-29" :
      potential < 50 ? "30-49" :
      potential < 70 ? "50-69" :
      potential < 85 ? "70-84" : "85-100";
    histogram[bucket]++;
  }

  return { scored, belowGate, eligible: scored - belowGate, histogram };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? body.limit : undefined;
    const result = await run(limit);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});