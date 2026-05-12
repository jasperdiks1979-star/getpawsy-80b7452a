import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Beta(α,β) sampler via two Gamma(k,1) samples (Marsaglia-Tsang for k>=1, boost for k<1)
function gammaSample(k: number): number {
  if (k < 1) return gammaSample(k + 1) * Math.pow(Math.random(), 1 / k);
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x: number, v: number;
    do {
      const u1 = Math.random(), u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function betaSample(a: number, b: number): number {
  const x = gammaSample(a);
  const y = gammaSample(b);
  return x / (x + y);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const traceId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const minImpressions = Number(body.min_impressions ?? 200);
    const decisionThreshold = Number(body.decision_threshold ?? 0.95);
    const samples = Number(body.samples ?? 4000);

    const { data: experiments, error: expErr } = await supabase
      .from("mi_experiments")
      .select("id, name, status, winner_variant_id")
      .eq("status", "running");
    if (expErr) throw expErr;

    const results: any[] = [];
    let pausedCount = 0;
    let winnerCount = 0;

    for (const exp of experiments ?? []) {
      const { data: variants, error: varErr } = await supabase
        .from("mi_experiment_variants")
        .select("id, label, impressions, clicks, status, pin_queue_id")
        .eq("experiment_id", exp.id)
        .eq("status", "active");
      if (varErr) throw varErr;
      if (!variants || variants.length < 2) continue;

      const totalImp = variants.reduce((s, v) => s + (v.impressions ?? 0), 0);
      if (totalImp < minImpressions) {
        results.push({ experiment: exp.name, status: "insufficient_data", impressions: totalImp });
        continue;
      }

      // Bayesian win probability via Thompson sampling
      const wins = new Array(variants.length).fill(0);
      for (let s = 0; s < samples; s++) {
        let bestIdx = 0, bestVal = -1;
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const a = (v.clicks ?? 0) + 1;
          const b = Math.max(0, (v.impressions ?? 0) - (v.clicks ?? 0)) + 1;
          const draw = betaSample(a, b);
          if (draw > bestVal) { bestVal = draw; bestIdx = i; }
        }
        wins[bestIdx]++;
      }
      const probs = wins.map((w) => w / samples);

      const winnerIdx = probs.indexOf(Math.max(...probs));
      const winnerProb = probs[winnerIdx];
      const winnerVariant = variants[winnerIdx];

      // Persist posterior probabilities
      if (!dryRun) {
        for (let i = 0; i < variants.length; i++) {
          await supabase.from("mi_experiment_variants")
            .update({ posterior_win_prob: probs[i] })
            .eq("id", variants[i].id);
        }
      }

      const decision: any = {
        experiment: exp.name,
        experiment_id: exp.id,
        impressions: totalImp,
        variants: variants.map((v, i) => ({
          id: v.id, label: v.label,
          impressions: v.impressions, clicks: v.clicks,
          ctr: v.impressions ? v.clicks / v.impressions : 0,
          win_prob: probs[i],
        })),
        winner: { id: winnerVariant.id, label: winnerVariant.label, win_prob: winnerProb },
      };

      if (winnerProb >= decisionThreshold) {
        decision.action = "winner_selected";
        winnerCount++;
        if (!dryRun) {
          await supabase.from("mi_experiments")
            .update({ status: "completed", winner_variant_id: winnerVariant.id, ended_at: new Date().toISOString() })
            .eq("id", exp.id);

          // Pause loser variants and their linked pin queue items
          for (let i = 0; i < variants.length; i++) {
            if (i === winnerIdx) continue;
            const v = variants[i];
            await supabase.from("mi_experiment_variants").update({ status: "paused" }).eq("id", v.id);
            pausedCount++;
            if (v.pin_queue_id) {
              await supabase.from("pinterest_pin_queue")
                .update({ status: "paused", priority: "low" })
                .eq("id", v.pin_queue_id);
            }
          }
        }
      } else {
        decision.action = "continue";
      }
      results.push(decision);
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Evaluated ${results.length} experiments`,
      experiments_evaluated: results.length,
      winners_selected: winnerCount,
      losers_paused: pausedCount,
      dry_run: dryRun,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[mi-experiment-tracker]", e);
    return new Response(JSON.stringify({ ok: false, traceId, message: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});