// Evolution Engine — Predictive Score (Phase 1)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t0 = Date.now();
  const { data: runRow } = await sb.from("ee_runs").insert({ kind: "predictive_score", status: "running", triggered_by: "edge" }).select().single();
  const runId = runRow?.id as string | undefined;
  const stats: Record<string, number> = { drafts_scored: 0, fallbacks: 0 };

  try {
    const { data: model } = await sb.from("ee_model_versions").select("id").eq("name", "predictive_baseline").eq("is_active", true).limit(1).maybeSingle();
    const modelId = model?.id ?? null;

    const { data: drafts } = await sb
      .from("pcie2_publish_queue")
      .select("id, product_id, board_id, headline, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data: vectors } = await sb.from("ee_learning_vectors").select("ctr_score, composite_score").limit(1000);
    const avg = (xs: (number | null)[]) => {
      const f = xs.filter((x): x is number => typeof x === "number");
      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0.02;
    };
    const priorCtr = avg((vectors ?? []).map((v: any) => v.ctr_score));
    const priorComposite = avg((vectors ?? []).map((v: any) => v.composite_score));

    for (const d of (drafts ?? []) as any[]) {
      let predictedCtr = priorCtr;
      let confidence = 0.3;
      let predictedRevenue = 0;
      if (d.product_id) {
        const { data: prod } = await sb.from("ee_learning_products").select("avg_ctr, revenue_total, pins_count").eq("product_id", d.product_id).maybeSingle();
        if (prod) {
          if (prod.avg_ctr != null) { predictedCtr = Number(prod.avg_ctr); confidence = Math.min(0.95, 0.4 + Math.log10((prod.pins_count ?? 0) + 1) * 0.2); }
          if (prod.revenue_total != null && prod.pins_count) predictedRevenue = Number(prod.revenue_total) / prod.pins_count;
        } else {
          stats.fallbacks += 1;
        }
      }
      const predictedImpressions = 500;
      const predictedOutbound = Math.round(predictedImpressions * predictedCtr);
      const predictedSaves = Math.round(predictedOutbound * 0.6);
      const predictedPurchases = Math.round(predictedOutbound * 0.02);
      const predictedRoas = predictedRevenue > 0 ? predictedRevenue / Math.max(1, predictedOutbound * 0.1) : null;

      await sb.from("ee_predictions").insert({
        draft_id: d.id,
        product_id: d.product_id ?? null,
        model_version_id: modelId,
        predicted_impressions: predictedImpressions,
        predicted_ctr: predictedCtr,
        predicted_outbound: predictedOutbound,
        predicted_saves: predictedSaves,
        predicted_purchases: predictedPurchases,
        predicted_revenue: predictedRevenue,
        predicted_roas: predictedRoas,
        spam_risk: 0,
        trust_score: 0.7,
        novelty_score: priorComposite,
        confidence,
        window_start: new Date().toISOString(),
        window_end: new Date(Date.now() + 14 * 86400_000).toISOString(),
        features: { headline: d.headline, board_id: d.board_id },
      });
      stats.drafts_scored += 1;
    }

    await sb.from("ee_runs").update({ status: "ok", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: true, runId, stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const err = (e as Error)?.message ?? String(e);
    await sb.from("ee_runs").update({ status: "error", finished_at: new Date().toISOString(), duration_ms: Date.now() - t0, error: err, stats }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: err, stats }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});