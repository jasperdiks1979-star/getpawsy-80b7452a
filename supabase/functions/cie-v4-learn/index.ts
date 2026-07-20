// Genesis V4 — Creative Intelligence Engine: hourly self-learning loop.
// 1) Reads gv4_genome_v (Wilson-weighted trait winners/losers from real perf).
// 2) Upserts gcd_genes (EMA weight, wins/losses, confidence) for every trait.
// 3) Snapshots top weights to pei_weight_snapshots for the evolution timeline.
// 4) Writes gcd_learnings evidence rows for material deltas.
// 5) Predicts winners/failures for current pinterest_pin_queue drafts into gcd_predictions.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EMA = 0.3;
const MATERIAL_DELTA = 0.05;

type GenomeRow = {
  trait_dim: string; trait_value: string; sample_n: number;
  wins: number; losses: number; purchases: number;
  winner_wilson: number; loser_wilson: number; net_score: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: genome, error: gErr } = await sb
    .from("gv4_genome_v" as never)
    .select("*")
    .returns<GenomeRow[]>();
  if (gErr) return new Response(JSON.stringify({ error: gErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let updated = 0, learnings = 0;
  const topWinners: GenomeRow[] = []; const topLosers: GenomeRow[] = [];

  for (const g of genome ?? []) {
    if (!g.trait_value) continue;
    const family = "global";
    const { data: existing } = await sb.from("gcd_genes")
      .select("id, weight, confidence, wins, losses, evidence_count")
      .eq("family", family).eq("gene_type", g.trait_dim).eq("gene_value", g.trait_value).maybeSingle();
    const newWeight = g.net_score;
    const prevWeight = Number(existing?.weight ?? 0);
    const ema = existing ? (1 - EMA) * prevWeight + EMA * newWeight : newWeight;
    const conf = Math.max(g.winner_wilson, g.loser_wilson);
    const row: Record<string, unknown> = {
      family, gene_type: g.trait_dim, gene_value: g.trait_value,
      weight: ema, confidence: conf, wins: g.wins, losses: g.losses,
      evidence_count: g.sample_n, last_evidence_at: new Date().toISOString(), is_active: true,
    };
    if (existing) await sb.from("gcd_genes").update(row).eq("id", existing.id);
    else await sb.from("gcd_genes").insert(row);
    updated++;

    if (Math.abs(ema - prevWeight) >= MATERIAL_DELTA) {
      await sb.from("gcd_learnings").insert({
        engine_source: "cie-v4-learn", scope: "trait",
        family, gene_type: g.trait_dim, gene_value: g.trait_value,
        insight: ema > prevWeight ? "trait strengthened" : "trait weakened",
        evidence: g as any, confidence: conf,
        delta_weight: ema - prevWeight, delta_confidence: 0, applied: true,
      });
      learnings++;
    }
    if (g.net_score > 0.2 && topWinners.length < 25) topWinners.push(g);
    if (g.net_score < -0.1 && topLosers.length < 25) topLosers.push(g);
  }

  // Evolution snapshot.
  await sb.from("pei_weight_snapshots").insert({
    taken_at: new Date().toISOString(),
    country: "US",
    snapshot: { winners: topWinners, losers: topLosers, total: genome?.length ?? 0 } as any,
    notes: "cie-v4-learn hourly snapshot",
  } as never);

  // Predict drafts.
  const { data: drafts } = await sb.from("pinterest_pin_queue")
    .select("id, meta, pin_title, pin_description")
    .eq("status", "draft").limit(200);
  let predicted = 0;
  for (const d of drafts ?? []) {
    const dna = (d.meta as any)?.intelligence?.dna ?? {};
    let score = 0; let n = 0;
    for (const [k, v] of Object.entries(dna)) {
      const hit = (genome ?? []).find((g) => g.trait_dim === k && String(g.trait_value) === String(v));
      if (hit) { score += hit.net_score; n++; }
    }
    const predicted_value = n ? Math.max(0, Math.min(1, 0.5 + score / Math.max(1, n))) : 0.5;
    await sb.from("gcd_predictions").insert({
      creative_id: d.id, prediction_type: "purchase_probability",
      predicted_value, ci_low: Math.max(0, predicted_value - 0.1), ci_high: Math.min(1, predicted_value + 0.1),
      confidence: n ? Math.min(0.95, n / 10) : 0.1,
      features: dna as any, engine_source: "cie-v4-learn", model_version: 1,
    } as never);
    predicted++;
  }

  return new Response(JSON.stringify({
    ok: true, traits: genome?.length ?? 0, updated_genes: updated,
    learnings_logged: learnings, drafts_predicted: predicted,
    top_winners: topWinners.slice(0, 10), top_losers: topLosers.slice(0, 10),
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});