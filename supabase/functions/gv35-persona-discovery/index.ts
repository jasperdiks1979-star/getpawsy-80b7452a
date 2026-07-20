// Genesis V3.5 — Persona Discovery
// Builds personas from existing mi_audience_clusters + gcp_concepts(customer_segments) + canonical conversions.
// No placeholder AI. Wilson-bounded confidence. Never overwrites human_locked.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SEED_PERSONAS: Array<{ slug: string; name: string; intent: string; emotion: string; lifestyle: string; budget: string }> = [
  { slug: "busy_cat_mom", name: "Busy Cat Mom", intent: "save time on cat care", emotion: "convenience", lifestyle: "working professional, 1-2 cats", budget: "mid" },
  { slug: "luxury_home_owner", name: "Luxury Home Owner", intent: "premium aesthetic that matches home", emotion: "pride", lifestyle: "design-forward homeowner", budget: "high" },
  { slug: "minimalist_interior_lover", name: "Minimalist Interior Lover", intent: "hide pet clutter", emotion: "organization", lifestyle: "neutral palette, clean lines", budget: "mid" },
  { slug: "dog_adventure_family", name: "Dog Adventure Family", intent: "gear for active dogs", emotion: "joy", lifestyle: "outdoor weekends, hikes", budget: "mid" },
  { slug: "apartment_cat_owner", name: "Apartment Cat Owner", intent: "small-space cat solutions", emotion: "comfort", lifestyle: "urban renter", budget: "mid" },
  { slug: "first_time_cat_parent", name: "First-Time Cat Parent", intent: "starter guidance and essentials", emotion: "love", lifestyle: "new adopter", budget: "low" },
  { slug: "senior_dog_owner", name: "Senior Dog Owner", intent: "comfort for aging dogs", emotion: "safety", lifestyle: "older dog, joint care", budget: "mid" },
  { slug: "premium_pet_parent", name: "Premium Pet Parent", intent: "best-quality for pets", emotion: "luxury", lifestyle: "treats pet as family", budget: "high" },
  { slug: "tech_enthusiast", name: "Tech Enthusiast", intent: "smart automated pet gear", emotion: "curiosity", lifestyle: "early adopter", budget: "high" },
  { slug: "eco_conscious_owner", name: "Eco Conscious Owner", intent: "sustainable pet products", emotion: "pride", lifestyle: "green household", budget: "mid" },
];

function wilsonLower(successes: number, trials: number, z = 1.645): number {
  if (trials <= 0) return 0;
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * trials)) / trials);
  return Math.max(0, Math.min(1, (center - margin) / denom));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pull supporting evidence (best-effort, ignore failures)
  const clusters = await supabase.from("mi_audience_clusters").select("cohort_key, channel, hook_family, conversions, revenue").limit(500);
  const concepts = await supabase.from("gcp_concepts").select("module_key, concept_key, weight, confidence, evidence").eq("module_key", "customer_segments").limit(200);

  const upserts: any[] = [];
  for (const seed of SEED_PERSONAS) {
    const cohortHits = (clusters.data ?? []).filter((c: any) =>
      (c.cohort_key ?? "").toLowerCase().includes(seed.slug.split("_")[0])
    );
    const conv = cohortHits.reduce((s: number, c: any) => s + Number(c.conversions ?? 0), 0);
    const totalConv = (clusters.data ?? []).reduce((s: number, c: any) => s + Number(c.conversions ?? 0), 0);
    const conceptMatch = (concepts.data ?? []).find((c: any) =>
      (c.concept_key ?? "").toLowerCase().replace(/[^a-z]+/g, "_").includes(seed.slug.split("_")[0])
    );
    const evidenceCount = conv + Number(conceptMatch?.evidence ?? 0);
    const confidence = Math.max(
      wilsonLower(conv, Math.max(totalConv, 1)),
      Number(conceptMatch?.confidence ?? 0)
    );
    upserts.push({
      slug: seed.slug,
      name: seed.name,
      intent: seed.intent,
      motivation: seed.intent,
      lifestyle: seed.lifestyle,
      budget_band: seed.budget,
      primary_emotion: seed.emotion,
      confidence,
      evidence_count: evidenceCount,
      evidence_sources: {
        mi_audience_clusters: cohortHits.length,
        gcp_concept: conceptMatch?.concept_key ?? null,
        cohort_conversions: conv,
      },
      source_cohort_key: cohortHits[0]?.cohort_key ?? null,
      source_concept_key: conceptMatch?.concept_key ?? null,
      status: "active",
      updated_at: new Date().toISOString(),
    });
  }

  // Only upsert rows that are NOT human_locked
  const { data: existing } = await supabase.from("gv35_audience_personas").select("slug, human_locked");
  const locked = new Set((existing ?? []).filter((r: any) => r.human_locked).map((r: any) => r.slug));
  const safe = upserts.filter((u) => !locked.has(u.slug));

  const { error, data } = await supabase.from("gv35_audience_personas").upsert(safe, { onConflict: "slug" }).select("id, slug, confidence");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true, upserted: data?.length ?? 0, locked_skipped: locked.size }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});