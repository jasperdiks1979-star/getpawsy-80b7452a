// AI Pinterest Director — auto-decides best style/hook/voice for a product
// based on category, recent historical performance and Pinterest trend signals.
// Returns a ranked list of concepts (top N) for the studio to render in parallel.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

type Concept = {
  style: "viral" | "lifestyle" | "cinematic" | "premium" | "conversion";
  hookVariant: string;
  voiceStyle: "social_energetic" | "lifestyle_female" | "narrator" | "pet_parent";
  preset: "pin-organic" | "pin-ads";
  predicted_score: number;
  reasoning: string;
};

const STYLE_DEFAULTS: Record<string, Omit<Concept, "predicted_score" | "reasoning">> = {
  viral:      { style: "viral",      hookVariant: "viral",      voiceStyle: "social_energetic", preset: "pin-organic" },
  lifestyle:  { style: "lifestyle",  hookVariant: "lifestyle",  voiceStyle: "lifestyle_female", preset: "pin-organic" },
  cinematic:  { style: "cinematic",  hookVariant: "cinematic",  voiceStyle: "narrator",         preset: "pin-ads" },
  premium:    { style: "premium",    hookVariant: "premium",    voiceStyle: "narrator",         preset: "pin-ads" },
  conversion: { style: "conversion", hookVariant: "conversion", voiceStyle: "pet_parent",       preset: "pin-ads" },
};

function heuristicRank(category: string | null, history: Array<{ hook_variant: string | null; voice_style: string | null; qa_composite_score: number | null; pinterest_quality_score: number | null }>): Concept[] {
  const cat = (category || "").toLowerCase();
  const base: number[] = [];
  const order: (keyof typeof STYLE_DEFAULTS)[] = ["viral", "lifestyle", "cinematic", "premium", "conversion"];

  // Category priors
  const prior: Record<string, number> = {
    viral: 70, lifestyle: 70, cinematic: 72, premium: 65, conversion: 68,
  };
  if (/cat\s*tree|scratch|litter/.test(cat)) { prior.lifestyle += 8; prior.cinematic += 6; }
  if (/bed|orthopedic|memory/.test(cat))      { prior.lifestyle += 10; prior.premium += 5; }
  if (/toy|gadget|interactive/.test(cat))     { prior.viral += 10; prior.conversion += 4; }
  if (/carrier|stroller|travel/.test(cat))    { prior.premium += 6; prior.cinematic += 4; }
  if (/grooming|feed|bowl/.test(cat))         { prior.conversion += 6; prior.lifestyle += 4; }

  // Historical signal
  const hist: Record<string, { sum: number; n: number }> = {};
  for (const h of history) {
    const v = h.hook_variant || "";
    if (!STYLE_DEFAULTS[v]) continue;
    const s = (h.qa_composite_score ?? 0) * 0.6 + (h.pinterest_quality_score ?? 0) * 0.4;
    if (!hist[v]) hist[v] = { sum: 0, n: 0 };
    hist[v].sum += s; hist[v].n += 1;
  }
  for (const k of Object.keys(prior)) {
    const h = hist[k];
    if (h && h.n > 0) prior[k] = Math.round(prior[k] * 0.5 + (h.sum / h.n) * 0.5);
  }

  return order
    .map(k => ({
      ...STYLE_DEFAULTS[k],
      predicted_score: prior[k],
      reasoning: `Category prior + ${hist[k]?.n ?? 0} historical samples`,
    }))
    .sort((a, b) => b.predicted_score - a.predicted_score);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { product_slug, top_n = 3 } = await req.json();
    if (!product_slug) {
      return new Response(JSON.stringify({ ok: false, message: "product_slug required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: product } = await sb.from("products_public")
      .select("slug, name, category").eq("slug", product_slug).maybeSingle();

    const { data: history } = await sb.from("cinematic_ad_jobs")
      .select("hook_variant, voice_style, qa_composite_score, pinterest_quality_score, product_slug, status")
      .in("status", ["rendered", "render_complete", "pinterest_uploaded", "published"])
      .order("created_at", { ascending: false })
      .limit(200);

    // Prefer same-category history if we can join via products_public
    let scoped = history ?? [];
    if (product?.category && scoped.length > 0) {
      const slugs = Array.from(new Set(scoped.map(h => h.product_slug).filter(Boolean)));
      const { data: catRows } = await sb.from("products_public").select("slug, category").in("slug", slugs);
      const same = new Set((catRows ?? []).filter(r => r.category === product.category).map(r => r.slug));
      const filtered = scoped.filter(h => same.has(h.product_slug));
      if (filtered.length >= 5) scoped = filtered;
    }

    const ranked = heuristicRank(product?.category ?? null, scoped as any);
    const concepts = ranked.slice(0, Math.max(1, Math.min(top_n, 5)));
    const winner = concepts[0];

    return new Response(JSON.stringify({
      ok: true,
      product: product ?? { slug: product_slug },
      winner,
      concepts,
      meta: { history_samples: scoped.length, category: product?.category ?? null },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : "decide failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});