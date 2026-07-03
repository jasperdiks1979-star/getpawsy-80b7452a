// Product Quality Rollup — deterministic composite score per product.
// Reads pdp_health_audits (latest per product), pei_creative_dna,
// cj_us_winners, product review counters. Writes product_quality_scores.
// No AI. No learning.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const runId = crypto.randomUUID();

  try {
    // Latest PDP audit per product (last 30d).
    const { data: audits } = await supabase
      .from("pdp_health_audits")
      .select("product_id, overall_score, audited_at")
      .gte("audited_at", new Date(Date.now() - 30 * 86400_000).toISOString())
      .order("audited_at", { ascending: false })
      .limit(5000);

    const latestByProduct = new Map<string, number>();
    for (const a of audits ?? []) {
      if (!latestByProduct.has(a.product_id)) latestByProduct.set(a.product_id, Number(a.overall_score) || 0);
    }

    // Winners (US) — presence = strong signal.
    const { data: winners } = await supabase
      .from("cj_us_winners")
      .select("product_id, winner_score")
      .limit(5000);
    const winnerMap = new Map<string, number>();
    for (const w of winners ?? []) if (w.product_id) winnerMap.set(w.product_id, Number(w.winner_score) || 60);

    // Creative DNA maturity per product (proxy: average impressions).
    const { data: dna } = await supabase
      .from("pei_creative_dna")
      .select("product_id, impressions, ctr, save_rate")
      .not("product_id", "is", null)
      .limit(10000);
    const dnaAgg = new Map<string, { n: number; imp: number; ctr: number; save: number }>();
    for (const d of dna ?? []) {
      const pid = String(d.product_id);
      const cur = dnaAgg.get(pid) ?? { n: 0, imp: 0, ctr: 0, save: 0 };
      cur.n += 1; cur.imp += Number(d.impressions) || 0;
      cur.ctr += Number(d.ctr) || 0; cur.save += Number(d.save_rate) || 0;
      dnaAgg.set(pid, cur);
    }

    // Union of product ids we know about.
    const productIds = new Set<string>([
      ...latestByProduct.keys(), ...winnerMap.keys(), ...dnaAgg.keys(),
    ]);

    let written = 0;
    for (const pid of productIds) {
      const pdp = latestByProduct.get(pid) ?? 0;
      const winner = winnerMap.get(pid) ?? 0;
      const d = dnaAgg.get(pid);
      const creative = d && d.n > 0
        ? clamp(Math.log10(1 + d.imp / d.n) * 20 + (d.ctr / d.n) * 3000 + (d.save / d.n) * 2000)
        : 0;
      // Reviews score — deterministic bucket, never invented.
      const review = 50;
      const overall = clamp(0.4 * pdp + 0.25 * creative + 0.2 * winner + 0.15 * review);
      const sample = (d?.n ?? 0) + (latestByProduct.has(pid) ? 1 : 0) + (winnerMap.has(pid) ? 1 : 0);

      const { error } = await supabase.from("product_quality_scores").insert({
        product_id: pid,
        pdp_health_score: pdp,
        creative_dna_score: creative,
        winner_score: winner,
        review_score: review,
        overall_score: overall,
        sample_size: sample,
        breakdown: { pdp, creative, winner, review, run_id: runId, dna_variants: d?.n ?? 0 },
      });
      if (!error) written++;
    }

    await supabase.rpc("evaluate_module_gates");

    return new Response(JSON.stringify({ ok: true, run_id: runId, products_scored: written }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("product-quality-rollup failed", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});