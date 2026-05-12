import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_DAYS = 7;
const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 80;
const DEFAULT_THRESHOLD = 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun: boolean = !!body?.dry_run;

    // Load current threshold
    const { data: thresholdRow } = await supabase
      .from("mi_tuning_state")
      .select("value")
      .eq("scope", "readiness")
      .eq("key", "promote_threshold")
      .maybeSingle();
    const thresholdBefore = Number(thresholdRow?.value ?? DEFAULT_THRESHOLD);

    // Load active recipes + recent performance
    const { data: recipes } = await supabase
      .from("mi_creative_recipes")
      .select("id, name, hook_family, score, active");
    const recipeList = recipes ?? [];

    const { data: perf } = await supabase
      .from("mi_recipe_performance")
      .select("recipe_id, avg_ctr, avg_engagement_rate, composite_score, computed_at, window_days")
      .eq("window_days", 30)
      .order("computed_at", { ascending: false });

    // Latest perf per recipe
    const latestPerf = new Map<string, { ctr: number; eng: number; comp: number }>();
    for (const p of perf ?? []) {
      if (!latestPerf.has(p.recipe_id)) {
        latestPerf.set(p.recipe_id, {
          ctr: Number(p.avg_ctr ?? 0),
          eng: Number(p.avg_engagement_rate ?? 0),
          comp: Number(p.composite_score ?? 0),
        });
      }
    }

    // Compute hook-family aggregates
    const hookAgg: Record<string, { sum: number; n: number }> = {};
    for (const r of recipeList) {
      const fam = (r.hook_family || "unknown").toLowerCase();
      const m = latestPerf.get(r.id);
      if (!m) continue;
      hookAgg[fam] ||= { sum: 0, n: 0 };
      hookAgg[fam].sum += m.comp;
      hookAgg[fam].n += 1;
    }

    const allComps = Object.values(hookAgg).filter((v) => v.n > 0).map((v) => v.sum / v.n);
    const globalAvg = allComps.length ? allComps.reduce((a, b) => a + b, 0) / allComps.length : 0;

    const hookMultipliers: Record<string, number> = {};
    for (const [fam, v] of Object.entries(hookAgg)) {
      const avg = v.sum / Math.max(v.n, 1);
      // multiplier: 0.7 to 1.3 around globalAvg
      const ratio = globalAvg > 0 ? avg / globalAvg : 1;
      hookMultipliers[fam] = Math.max(0.7, Math.min(1.3, ratio));
    }

    // Recipe score adjustments
    let boosted = 0, decayed = 0, deactivated = 0;
    const updates: Array<{ id: string; score: number; active: boolean }> = [];
    for (const r of recipeList) {
      const m = latestPerf.get(r.id);
      const prevScore = Number(r.score ?? 0);
      let nextScore = prevScore;
      let active = r.active;
      if (m) {
        if (m.comp > globalAvg * 1.1) { nextScore = prevScore + 5; boosted++; }
        else if (m.comp < globalAvg * 0.7) { nextScore = Math.max(0, prevScore - 5); decayed++; }
        if (m.comp < globalAvg * 0.3 && prevScore <= 0) { active = false; deactivated++; }
      } else {
        // No perf data — gentle decay
        nextScore = Math.max(0, prevScore - 1);
      }
      if (nextScore !== prevScore || active !== r.active) {
        updates.push({ id: r.id, score: nextScore, active });
      }
    }

    // Adjust readiness threshold based on overall promotion success
    // If global avg engagement is high, lower threshold (we're being too strict)
    // If low, raise threshold (be more selective)
    let thresholdAfter = thresholdBefore;
    if (globalAvg > 50) thresholdAfter = Math.max(MIN_THRESHOLD, thresholdBefore - 2);
    else if (globalAvg < 10 && allComps.length > 3) thresholdAfter = Math.min(MAX_THRESHOLD, thresholdBefore + 2);

    if (!dryRun) {
      // Apply recipe updates
      for (const u of updates) {
        await supabase.from("mi_creative_recipes").update({ score: u.score, active: u.active }).eq("id", u.id);
      }
      // Persist threshold
      await supabase.from("mi_tuning_state").upsert({
        scope: "readiness", key: "promote_threshold", value: thresholdAfter,
      }, { onConflict: "scope,key" });
      // Persist hook multipliers
      for (const [fam, mult] of Object.entries(hookMultipliers)) {
        await supabase.from("mi_tuning_state").upsert({
          scope: "hook_family", key: fam, value: mult,
        }, { onConflict: "scope,key" });
      }
      // Log run
      await supabase.from("mi_tuning_runs").insert({
        window_days: WINDOW_DAYS,
        recipes_evaluated: recipeList.length,
        recipes_boosted: boosted,
        recipes_decayed: decayed,
        recipes_deactivated: deactivated,
        threshold_before: thresholdBefore,
        threshold_after: thresholdAfter,
        hook_multipliers: hookMultipliers,
        notes: `globalAvg=${globalAvg.toFixed(2)}; updates=${updates.length}`,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      recipes_evaluated: recipeList.length,
      recipes_boosted: boosted,
      recipes_decayed: decayed,
      recipes_deactivated: deactivated,
      threshold_before: thresholdBefore,
      threshold_after: thresholdAfter,
      hook_multipliers: hookMultipliers,
      global_avg: globalAvg,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
