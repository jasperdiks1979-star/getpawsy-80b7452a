// Pinterest Auto-Evolution (Phase 10)
// Reads recent winner dimensions + render-attempt acceptance rate, then tunes
// pinterest_strategy_state (quality threshold, exploit ratio, archetype boosts,
// hook boosts) within safe bounds. Every change is journaled to
// pinterest_evolution_log with rationale and metrics.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BOUNDS = {
  quality_threshold: { min: 72, max: 90, step: 1 },
  exploit_ratio: { min: 0.6, max: 0.9, step: 0.05 },
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace = crypto.randomUUID();
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const { data: stateRow } = await supabase
      .from("pinterest_strategy_state").select("*").eq("id", 1).maybeSingle();
    const state = stateRow ?? {
      id: 1, quality_threshold: 80, exploit_ratio: 0.8,
      archetype_boosts: {}, hook_boosts: {}, trend_modifiers: {},
    };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1) Acceptance rate over the last 24h drives quality_threshold.
    const { data: attempts } = await supabase
      .from("pinterest_render_attempts")
      .select("rejected, total_score")
      .gte("created_at", since)
      .limit(2000);
    const total = attempts?.length ?? 0;
    const accepted = (attempts ?? []).filter((a) => !a.rejected).length;
    const acceptRate = total > 0 ? accepted / total : null;

    let newThreshold = Number(state.quality_threshold);
    const decisions: any[] = [];
    if (acceptRate !== null && total >= 30) {
      if (acceptRate < 0.35) {
        newThreshold = clamp(newThreshold - BOUNDS.quality_threshold.step,
          BOUNDS.quality_threshold.min, BOUNDS.quality_threshold.max);
      } else if (acceptRate > 0.75) {
        newThreshold = clamp(newThreshold + BOUNDS.quality_threshold.step,
          BOUNDS.quality_threshold.min, BOUNDS.quality_threshold.max);
      }
      if (newThreshold !== Number(state.quality_threshold)) {
        decisions.push({
          decision_type: "quality_threshold_tune",
          target_dimension: "quality_threshold",
          old_value: { value: Number(state.quality_threshold) },
          new_value: { value: newThreshold },
          rationale: `acceptance ${(acceptRate * 100).toFixed(1)}% over ${total} attempts`,
          metrics: { acceptRate, total, accepted },
        });
      }
    }

    // 2) Top 5 winning archetypes get a +0.1..+0.3 boost; bottom losers decay.
    const { data: winners } = await supabase
      .from("pinterest_winner_dimensions")
      .select("niche_key, pin_mode, hook_category, composite_score, sample_size")
      .eq("is_active", true)
      .gte("sample_size", 3)
      .order("composite_score", { ascending: false })
      .limit(40);
    const archetypeBoosts: Record<string, number> = {};
    const hookBoosts: Record<string, number> = {};
    for (const w of winners ?? []) {
      if (w.pin_mode) {
        const k = `${w.niche_key}:${w.pin_mode}`;
        archetypeBoosts[k] = Math.max(archetypeBoosts[k] ?? 0,
          Math.min(0.3, Number(w.composite_score) / 100 * 0.3));
      }
      if (w.hook_category) {
        const k = `${w.niche_key}:${w.hook_category}`;
        hookBoosts[k] = Math.max(hookBoosts[k] ?? 0,
          Math.min(0.3, Number(w.composite_score) / 100 * 0.3));
      }
    }

    // 3) Exploit ratio nudges with sample size — more data = more exploit.
    const sampleSize = (winners ?? []).reduce((s, w) => s + Number(w.sample_size ?? 0), 0);
    let newExploit = Number(state.exploit_ratio);
    if (sampleSize > 200 && newExploit < 0.85) newExploit = 0.85;
    else if (sampleSize < 30 && newExploit > 0.7) newExploit = 0.7;
    newExploit = clamp(newExploit, BOUNDS.exploit_ratio.min, BOUNDS.exploit_ratio.max);
    if (newExploit !== Number(state.exploit_ratio)) {
      decisions.push({
        decision_type: "exploit_ratio_tune",
        target_dimension: "exploit_ratio",
        old_value: { value: Number(state.exploit_ratio) },
        new_value: { value: newExploit },
        rationale: `sample size ${sampleSize} across active winners`,
        metrics: { sampleSize },
      });
    }

    decisions.push({
      decision_type: "boost_refresh",
      target_dimension: "boosts",
      old_value: { archetype: state.archetype_boosts, hook: state.hook_boosts },
      new_value: { archetype: archetypeBoosts, hook: hookBoosts },
      rationale: `refreshed boosts from ${winners?.length ?? 0} active winners`,
      metrics: { winnerCount: winners?.length ?? 0 },
    });

    await supabase.from("pinterest_strategy_state").update({
      quality_threshold: newThreshold,
      exploit_ratio: newExploit,
      archetype_boosts: archetypeBoosts,
      hook_boosts: hookBoosts,
      last_evolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", 1);

    if (decisions.length) {
      await supabase.from("pinterest_evolution_log").insert(decisions);
    }

    return ok({
      ok: true, traceId: trace,
      acceptRate, total, sampleSize,
      newThreshold, newExploit,
      decisions: decisions.length,
    });
  } catch (e) {
    return ok({ ok: false, traceId: trace, message: (e as Error).message }, 500);
  }
});