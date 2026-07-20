// AI Pinterest Director — Phase 3 Self-Learning
// Returns the 4 fundamental concept archetypes (Problem/Solution, Emotional,
// Premium Lifestyle, Viral Pattern Interrupt) ranked by learned weights per
// category × archetype + Pinterest historical performance. Creates a
// director_run row so all 4 concepts can be tracked end-to-end through the
// feedback loop.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ArchetypeId = "problem_solution" | "emotional" | "premium_lifestyle" | "viral_interrupt";

type ArchetypeSpec = {
  id: ArchetypeId;
  label: string;
  hookVariant: string;
  voiceStyle: "social_energetic" | "lifestyle_female" | "narrator" | "pet_parent";
  preset: "pin-organic" | "pin-ads";
  pacing: "snappy" | "warm" | "cinematic" | "punchy";
  motionPlan: string;
  ctaIntent: string;
};

const ARCHETYPES: ArchetypeSpec[] = [
  { id: "problem_solution",  label: "Problem / Solution",       hookVariant: "conversion", voiceStyle: "pet_parent",       preset: "pin-ads",     pacing: "punchy",    motionPlan: "push_in on problem → demo → rack_focus → static CTA", ctaIntent: "Shop now" },
  { id: "emotional",         label: "Emotional Connection",     hookVariant: "lifestyle",  voiceStyle: "lifestyle_female", preset: "pin-organic", pacing: "warm",      motionPlan: "slow dolly → orbit bond moment → warm grade → reveal", ctaIntent: "Treat them today" },
  { id: "premium_lifestyle", label: "Premium Lifestyle",        hookVariant: "cinematic",  voiceStyle: "narrator",         preset: "pin-ads",     pacing: "cinematic", motionPlan: "wide reveal → tracking → rack_focus detail → hero static", ctaIntent: "Discover the collection" },
  { id: "viral_interrupt",   label: "Viral Pattern Interrupt",  hookVariant: "viral",      voiceStyle: "social_energetic", preset: "pin-organic", pacing: "snappy",    motionPlan: "hard cut hook → handheld → parallax pop → snap zoom CTA", ctaIntent: "Tap to see why" },
];

function categoryPriors(cat: string | null): Record<ArchetypeId, number> {
  const c = (cat || "").toLowerCase();
  const p: Record<ArchetypeId, number> = {
    problem_solution: 70, emotional: 70, premium_lifestyle: 72, viral_interrupt: 70,
  };
  if (/cat\s*tree|scratch|litter/.test(c)) { p.premium_lifestyle += 6; p.emotional += 4; }
  if (/bed|orthopedic|memory/.test(c))      { p.emotional += 8;          p.premium_lifestyle += 6; }
  if (/toy|gadget|interactive/.test(c))     { p.viral_interrupt += 10;   p.problem_solution += 4; }
  if (/carrier|stroller|travel/.test(c))    { p.premium_lifestyle += 6;  p.emotional += 4; }
  if (/grooming|feed|bowl|health|supplement/.test(c)) { p.problem_solution += 8; p.emotional += 4; }
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { product_slug, persist = true } = await req.json();
    if (!product_slug) {
      return new Response(JSON.stringify({ ok: false, message: "product_slug required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: product } = await sb.from("products_public")
      .select("slug, name, category").eq("slug", product_slug).maybeSingle();
    const category = product?.category ?? null;

    // 1. Learned weights (category-specific overlay onto wildcard)
    const { data: wildcard } = await sb.from("director_archetype_weights")
      .select("archetype, weight, samples, wins, avg_ctr, avg_engagement_rate")
      .eq("category", "*");
    const { data: catWeights } = category
      ? await sb.from("director_archetype_weights")
          .select("archetype, weight, samples, wins, avg_ctr, avg_engagement_rate")
          .eq("category", category)
      : { data: [] as any[] };

    const weightMap = new Map<string, { weight: number; samples: number; wins: number; ctr: number; eng: number }>();
    for (const w of wildcard ?? []) {
      weightMap.set(w.archetype, { weight: Number(w.weight) || 1, samples: w.samples || 0, wins: w.wins || 0, ctr: Number(w.avg_ctr) || 0, eng: Number(w.avg_engagement_rate) || 0 });
    }
    for (const w of catWeights ?? []) {
      const prev = weightMap.get(w.archetype) ?? { weight: 1, samples: 0, wins: 0, ctr: 0, eng: 0 };
      // Category weights override when they have meaningful samples
      const blend = (w.samples || 0) >= 3 ? 0.8 : 0.4;
      weightMap.set(w.archetype, {
        weight: prev.weight * (1 - blend) + Number(w.weight) * blend,
        samples: prev.samples + (w.samples || 0),
        wins: prev.wins + (w.wins || 0),
        ctr: Math.max(prev.ctr, Number(w.avg_ctr) || 0),
        eng: Math.max(prev.eng, Number(w.avg_engagement_rate) || 0),
      });
    }

    const priors = categoryPriors(category);

    // 2. Build ranked concepts for all 4 archetypes
    const concepts = ARCHETYPES.map((a) => {
      const w = weightMap.get(a.id) ?? { weight: 1, samples: 0, wins: 0, ctr: 0, eng: 0 };
      const predicted = Math.round((priors[a.id] * 0.5 + w.weight * 30) + w.ctr * 200 + w.eng * 50);
      return {
        archetype: a.id,
        label: a.label,
        style: a.id,
        hookVariant: a.hookVariant,
        voiceStyle: a.voiceStyle,
        preset: a.preset,
        pacing: a.pacing,
        motionPlan: a.motionPlan,
        ctaIntent: a.ctaIntent,
        predicted_score: predicted,
        learned_weight: Number(w.weight.toFixed(3)),
        samples: w.samples,
        wins: w.wins,
        reasoning: `prior ${priors[a.id]} · weight ${w.weight.toFixed(2)} · ${w.samples} samples (${w.wins} wins)`,
      };
    }).sort((x, y) => y.predicted_score - x.predicted_score);

    // 3. Create a director_run shell so jobs can be linked to it
    let runId: string | null = null;
    if (persist) {
      const { data: run } = await sb.from("director_runs").insert({
        product_slug,
        category,
        winner_archetype: concepts[0].archetype,
        decided_reasoning: concepts.map(c => `${c.archetype}=${c.predicted_score}`).join(" · "),
      }).select("id").maybeSingle();
      runId = run?.id ?? null;

      if (runId) {
        await sb.from("director_concepts").insert(
          concepts.map(c => ({
            run_id: runId,
            archetype: c.archetype,
            product_slug,
            category,
            predicted_score: c.predicted_score,
          })),
        );
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      run_id: runId,
      product: product ?? { slug: product_slug },
      winner: concepts[0],
      concepts,
      meta: { category, archetypes: ARCHETYPES.length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : "decide failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});