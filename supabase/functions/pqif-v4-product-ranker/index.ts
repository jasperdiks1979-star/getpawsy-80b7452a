// PQIF v4 — Revenue Potential Ranker
import { corsHeaders, svc, startRun, finishRun, logDecision } from "../_shared/pqif-v4-common.ts";

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const runId = await startRun("product-ranker");
  try {
    const s = svc();
    const today = new Date().toISOString().slice(0, 10);
    const { data: products } = await s.from("products")
      .select("id, name, margin_percent, us_stock, effective_stock, is_active")
      .eq("is_active", true)
      .limit(2000);
    const { data: paipRanks } = await s.from("paip_product_daily_rank")
      .select("product_id, composite_score").order("run_date", { ascending: false }).limit(2000);
    const paipMap = new Map((paipRanks ?? []).map((r: any) => [r.product_id, Number(r.composite_score ?? 0)]));
    const { data: perf } = await s.from("pqif_family_performance")
      .select("family_id, performance_score").limit(2000).maybeSingle().then(() => ({ data: [] as any[] }));
    const scored: any[] = [];
    for (const p of products ?? []) {
      const margin = clamp(Number(p.margin_percent ?? 0) * 100);
      const stockN = Number(p.us_stock ?? p.effective_stock ?? 0);
      const stock = stockN > 5 ? 100 : stockN > 0 ? 60 : 0;
      const paip = clamp(paipMap.get(p.id) ?? 0);
      const revenue_potential = Math.round((margin * 0.35 + stock * 0.25 + paip * 0.40) * 100) / 100;
      scored.push({ product_id: p.id, run_date: today, revenue_potential,
        components: { margin, stock, paip } });
    }
    scored.sort((a, b) => b.revenue_potential - a.revenue_potential);
    scored.forEach((r, i) => r.rank = i + 1);
    for (let i = 0; i < scored.length; i += 200) {
      await s.from("pqif_v4_product_ranks").upsert(scored.slice(i, i + 200), { onConflict: "product_id,run_date" });
    }
    await logDecision(runId, "rank_products", "ok", { ranked: scored.length, top: scored.slice(0, 5) });
    await finishRun(runId, "ok", { ranked: scored.length });
    return new Response(JSON.stringify({ ok: true, ranked: scored.length, top10: scored.slice(0, 10) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    await finishRun(runId, "error", {}, e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});