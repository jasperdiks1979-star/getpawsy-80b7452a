import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await supabase.from("revenue_ai_settings").select("winner_clone_max_per_day").maybeSingle();
    const cap = settings?.winner_clone_max_per_day ?? 30;

    const { data: dna } = await supabase
      .from("revenue_ai_winner_dna")
      .select("dimension, key, ewma, n_pins")
      .gte("n_pins", 3)
      .order("ewma", { ascending: false })
      .limit(60);

    const byDim = new Map<string, any[]>();
    for (const d of (dna ?? []) as any[]) {
      const a = byDim.get(d.dimension) ?? [];
      a.push(d); byDim.set(d.dimension, a);
    }

    const { data: products } = await supabase
      .from("revenue_ai_revenue_scores")
      .select("product_id, composite, tier")
      .in("tier", ["hero", "winner"])
      .order("composite", { ascending: false })
      .limit(cap);

    const briefs = (products ?? []).map((p: any) => {
      const pickTop = (dim: string) => byDim.get(dim)?.[0]?.key ?? null;
      return {
        product_id: p.product_id,
        recipe: {
          voice: pickTop("voice"),
          hook: pickTop("hook"),
          cta: pickTop("cta"),
          duration: pickTop("duration"),
          camera: pickTop("camera"),
          category: pickTop("category"),
        },
        composite: p.composite,
        source: "revenue_ai_winner_clone",
      };
    });

    let enqueued = 0;
    for (const b of briefs) {
      const r = await supabase.functions.invoke("cinematic-ad-autopublish", { body: { product_id: b.product_id, recipe: b.recipe, source: b.source } });
      if (!r.error) enqueued += 1;
    }
    return new Response(JSON.stringify({ ok: true, briefs: briefs.length, enqueued }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});